import TemperatureLog from "../models/TemperatureLog.js";
import ThermometerSpot from "../models/ThermometerSpot.js";
import User from "../../models/User.js";
import Firm from "../../models/Firm.js";
import { extractTemperatureFromImage } from "../services/thermometerAiService.js";
import { getPermittedFirmsForModule } from "../../utils/userFirms.js";

const formatTimeIST = (date) => {
  if (!date) return '';
  const d = typeof date === 'number' ? new Date(date) : new Date(date);
  return d.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const getHourSlot = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    hour12: true,
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === 'hour')?.value || '12';
  const dayPeriod = parts.find((p) => p.type === 'dayPeriod')?.value?.toUpperCase() || 'AM';
  return `${hourPart.padStart(2, '0')}:00 ${dayPeriod}`;
};

 //  worker submit a single temperature reading via QR scan or manual 
  export const recordTemperature =async(req,res)=>{
         try{
             const {
                firm,spotId,
                spotCode,shed,
                line,position,
                temperature,verifiedQr,
                verifiedByQr,verifiedByAi,
                aiConfidence,thermometerImageUrl
             }=req.body;

            if (!firm) {
                return res.status(400).json({ success: false, message: 'Farm ID is required' });
             }

            // Verify worker has permission for this firm
            const permittedFirms = getPermittedFirmsForModule(req.user, 'temperature');
            if (permittedFirms !== null && !permittedFirms.includes(String(firm))) {
              return res.status(403).json({ success: false, message: 'You do not have permission to record readings for this farm.' });
            }

                if (temperature === undefined || temperature === null || isNaN(temperature)) {
              return res.status(400).json({ success: false, message: 'Valid temperature reading is required' });
            }
                let spotDoc = null;
                let finalShed = shed;
                let finalLine = line || 'Line 1';
                let finalPosition = position;
                   // Agar QR scan se spotId ya spotCode aaya hai, spot verify karein
               if (spotId || spotCode) {
              const query = spotId ? { _id: spotId } : { firm, spotCode: spotCode.trim().toUpperCase() };
              spotDoc = await ThermometerSpot.findOne(query);
             if (spotDoc) {
              finalShed = spotDoc.shed;
             finalLine = spotDoc.line;
            finalPosition = spotDoc.position;
      }
    }

          if (!finalShed || !finalPosition) {
      return res.status(400).json({
        success: false,
        message: 'Shed and position are required for temperature logging',
      });
    }
                // Current hour round calculate karein
    const roundSlot = getHourSlot();

         //   Create log entry
    const newLog = await TemperatureLog.create({
      firm,
      spot: spotDoc ? spotDoc._id : null,
      shed: finalShed,
      line: finalLine,
      position: finalPosition,
      temperature: Math.round(Number(temperature)),
      verifiedByqr: Boolean(verifiedQr || verifiedByQr),
      verifiedByAi: Boolean(verifiedByAi),
      aiConfidence: aiConfidence ? Number(aiConfidence) : null,
      thermometerImageUrl: thermometerImageUrl || null,
      roundSlot,
      capturedAt: new Date(),
      worker: req.user ? req.user._id : null,
      
    });

    return res.status(201).json({
      success: true,
      message: `Temperature ${Math.round(Number(temperature))}°C recorded for ${finalShed} - ${finalPosition}`,
      data: newLog,
    });
         } catch(error){
              console.log(`Error recording temperature : `,error);
              return res.status(500).json({
                success:false,
                message:'Server error while recording temperature reading'
              })

         }



 }


 //2. Get recent readings for the farm & round progress
 // GET /api/temperature/logs/recent?firm=...

export const getRecentLogs = async (req, res) => {
  try {
    const { firm, shed, limit = 20 } = req.query;
    const permittedFirms = getPermittedFirmsForModule(req.user, 'temperature');
    let targetFirmIds = [];

    if (!firm || firm === 'all') {
      if (permittedFirms === null) {
        const allFarms = await Firm.find({ active: true, code: { $ne: 'OFFICE' } }).select('_id').lean();
        targetFirmIds = allFarms.map((f) => f._id);
      } else {
        targetFirmIds = permittedFirms;
      }
    } else {
      if (permittedFirms !== null && !permittedFirms.includes(String(firm))) {
        return res.status(403).json({ success: false, message: 'You do not have access to this farm.' });
      }
      targetFirmIds = [firm];
    }

    const query = { firm: { $in: targetFirmIds } };
    if (shed && shed !== 'All sheds' && shed !== 'All Sheds') query.shed = shed;
    const logs = await TemperatureLog.find(query)
      .sort({ capturedAt: -1 })
      .limit(Number(limit))
      .populate('firm', 'name code')
      .populate('spot', 'spotCode active')
      .populate('worker', 'name');
    return res.status(200).json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    console.error('Error fetching recent logs:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching recent temperature logs',
    });
  }
};

/**
 * 3. Get Night Temperature Report with 6-column hourly matrix & KPIs
 * GET /api/temperature/logs/report?firm=...&date=YYYY-MM-DD&shed=...
 */
export const getTemperatureReport = async (req, res) => {
  try {
    const { firm, date, shed, shift = 'all' } = req.query;
    if (!firm) {
      return res.status(400).json({ success: false, message: 'Firm ID is required' });
    }

    const permittedFirms = getPermittedFirmsForModule(req.user, 'temperature');
    let targetFirmIds = [];
    const isAllFirms = firm === 'all';

    if (isAllFirms) {
      if (permittedFirms === null) {
        const allFarms = await Firm.find({ active: true, code: { $ne: 'OFFICE' } }).select('_id name code').lean();
        targetFirmIds = allFarms.map((f) => f._id);
      } else {
        targetFirmIds = permittedFirms;
      }
    } else {
      if (permittedFirms !== null && !permittedFirms.includes(String(firm))) {
        return res.status(403).json({ success: false, message: 'You do not have access to this farm.' });
      }
      targetFirmIds = [firm];
    }

    let targetDateStr;
    if (date && typeof date === 'string' && date.includes('-')) {
      targetDateStr = date.trim();
    } else {
      targetDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    }

    let dayStart, dayEnd;
    if (shift === 'night') {
      // Night shift spans from 18:00 (6 PM) of target date to 09:30 AM next morning in Asia/Kolkata
      const [y, m, d] = targetDateStr.split('-').map((v) => parseInt(v, 10));
      const nextDayDate = new Date(Date.UTC(y, m - 1, d + 1));
      const nextDayStr = nextDayDate.toISOString().slice(0, 10);
      dayStart = new Date(`${targetDateStr}T18:00:00+05:30`);
      dayEnd = new Date(`${nextDayStr}T09:30:00+05:30`);
    } else {
      dayStart = new Date(`${targetDateStr}T00:00:00+05:30`);
      dayEnd = new Date(`${targetDateStr}T23:59:59.999+05:30`);
    }

    const query = {
      firm: { $in: targetFirmIds },
      capturedAt: { $gte: dayStart, $lte: dayEnd },
    };
    if (shed && shed !== 'All sheds' && shed !== 'All Sheds') {
      query.shed = shed;
    }

    const logs = await TemperatureLog.find(query)
      .sort({ capturedAt: 1 })
      .populate('firm', 'name code')
      .populate('spot', 'spotCode orderIndex')
      .populate('worker', 'name');

    let totalTemp = 0;
    let minTemp = null;
    let minSpot = null;
    let maxTemp = null;
    let maxSpot = null;
    let alertsCount = 0;

    const rowsMap = new Map();

    for (const log of logs) {
      const temp = Math.round(log.temperature);
      totalTemp += temp;

      const logTime = new Date(log.capturedAt);
      const timeStr = formatTimeIST(logTime);

      const firmName = log.firm?.name || 'Farm';
      const firmIdStr = String(log.firm?._id || log.firm || '');
      const spotLoc = isAllFirms ? `${firmName} · ${log.shed} · ${timeStr}` : `${log.shed} · ${timeStr}`;

      if (minTemp === null || temp < minTemp) {
        minTemp = temp;
        minSpot = spotLoc;
      }
      if (maxTemp === null || temp > maxTemp) {
        maxTemp = temp;
        maxSpot = spotLoc;
      }
      if (temp < 22 || temp > 30) {
        alertsCount++;
      }

      // Smart clustering: find if there is an existing round for this firm, shed, line
      // captured within a 45-minute window or matching roundSlot where this position is not yet filled
      let matchedKey = null;
      const logEpoch = logTime.getTime();

      for (const [k, r] of rowsMap.entries()) {
        if (r.firmId === firmIdStr && r.shed === log.shed && r.line === log.line) {
          const isPosFilled =
            (log.position === 'Pad Side' && r.pad !== null) ||
            (log.position === 'Middle' && r.mid !== null) ||
            (log.position === 'Fan Side' && r.fan !== null);

          if (!isPosFilled && r.timestamps.length > 0) {
            const minT = Math.min(...r.timestamps);
            const maxT = Math.max(...r.timestamps);
            const withinWindow = Math.abs(logEpoch - minT) <= 45 * 60 * 1000 || Math.abs(logEpoch - maxT) <= 45 * 60 * 1000;
            if (withinWindow || r.slotKey === log.roundSlot) {
              matchedKey = k;
              break;
            }
          }
        }
      }

      const key = matchedKey || `${log.roundSlot || timeStr}_${firmIdStr}_${log.shed}_${log.line}_${logEpoch}`;

      if (!rowsMap.has(key)) {
        rowsMap.set(key, {
          slotKey: log.roundSlot || timeStr,
          time: timeStr,
          timestamps: [],
          rawTime: log.capturedAt,
          firmId: firmIdStr,
          firmName,
          shedLine: isAllFirms ? `${firmName} · ${log.shed} · ${log.line}` : `${log.shed} · ${log.line}`,
          shed: log.shed,
          line: log.line,
          logIds: [],
          padLogId: null,
          midLogId: null,
          fanLogId: null,
          pad: null,
          mid: null,
          fan: null,
          padTime: null,
          midTime: null,
          fanTime: null,
          padVerified: false,
          midVerified: false,
          fanVerified: false,
          worker: log.worker?.name || 'Worker',
          status: 'On time',
          missed: false,
        });
      }

      const row = rowsMap.get(key);
      if (log._id) {
        row.logIds.push(String(log._id));
      }
      if (log.capturedAt) {
        row.timestamps.push(logEpoch);
      }
      if (log.position === 'Pad Side') {
        row.pad = temp;
        row.padVerified = Boolean(log.verifiedByqr);
        row.padLogId = String(log._id);
        row.padTime = timeStr;
      }
      if (log.position === 'Middle') {
        row.mid = temp;
        row.midVerified = Boolean(log.verifiedByqr);
        row.midLogId = String(log._id);
        row.midTime = timeStr;
      }
      if (log.position === 'Fan Side') {
        row.fan = temp;
        row.fanVerified = Boolean(log.verifiedByqr);
        row.fanLogId = String(log._id);
        row.fanTime = timeStr;
      }
    }

    // Active spots & sheds for these target firms to detect missed hourly rounds
    const spots = await ThermometerSpot.find({ firm: { $in: targetFirmIds }, active: true }).populate('firm', 'name');
    
    // Extract all distinct configured sheds across target firms for the filter dropdown
    const allAvailableSheds = Array.from(new Set(spots.map((sp) => sp.shed))).sort();

    let shedLines = [];
    const shedLineSet = new Set();
    for (const sp of spots) {
      if (shed && shed !== 'All sheds' && shed !== 'All Sheds' && sp.shed !== shed) {
        continue;
      }
      const fId = String(sp.firm?._id || sp.firm || '');
      const fName = sp.firm?.name || 'Farm';
      const slKey = `${fId}_${sp.shed}_${sp.line}`;
      if (!shedLineSet.has(slKey)) {
        shedLineSet.add(slKey);
        shedLines.push({ firmId: fId, firmName: fName, shed: sp.shed, line: sp.line });
      }
    }
    // Fallback if no spots set up yet: extract from logs
    if (shedLines.length === 0) {
      for (const log of logs) {
        const fId = String(log.firm?._id || log.firm || '');
        const fName = log.firm?.name || 'Farm';
        const slKey = `${fId}_${log.shed}_${log.line}`;
        if (!shedLineSet.has(slKey)) {
          shedLineSet.add(slKey);
          shedLines.push({ firmId: fId, firmName: fName, shed: log.shed, line: log.line });
        }
      }
    }

    // Extract actual recorded rows from logs only
    const slotOrder = {
      '08:00 PM': 0, '09:00 PM': 1, '10:00 PM': 2, '11:00 PM': 3,
      '12:00 AM': 4, '01:00 AM': 5, '02:00 AM': 6, '03:00 AM': 7,
      '04:00 AM': 8, '05:00 AM': 9, '06:00 AM': 10, '07:00 AM': 11,
    };

    const rows = Array.from(rowsMap.values()).map((row) => {
      if (row.missed) return row;
      const vals = [row.pad, row.mid, row.fan].filter((v) => v !== null && v !== undefined);
      const avg = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : '—';

      // Calculate display time:
      // If 1 reading: exact same time as that reading
      // If multiple readings (2 or 3 of Pad, Mid, Fan): true average timestamp of the readings
      let displayTime = row.time;
      let timeSpan = '';
      const count = row.timestamps ? row.timestamps.length : 0;

      if (count === 1) {
        displayTime = formatTimeIST(row.timestamps[0]);
      } else if (count > 1) {
        const avgMillis = Math.round(
          row.timestamps.reduce((sum, t) => sum + t, 0) / count
        );
        displayTime = formatTimeIST(avgMillis);

        const minTime = formatTimeIST(Math.min(...row.timestamps));
        const maxTime = formatTimeIST(Math.max(...row.timestamps));
        timeSpan = `${minTime} – ${maxTime}`;
      }

      return {
        ...row,
        time: displayTime,
        readingsCount: count,
        timeSpan,
        avg: avg !== '—' ? Number(avg) : '—',
      };
    });

    // Sort: First by Firm Name (e.g. Raghav, Sanjana), then by Shed natural order, Line, and then chronological Time
    rows.sort((a, b) => {
      // 1. Group by Firm Name
      const firmCompare = (a.firmName || '').localeCompare(b.firmName || '');
      if (firmCompare !== 0) return firmCompare;

      // 2. Sort by Shed naturally (Shed 1, Shed 2, Shed 3...)
      const shedCompare = (a.shed || '').localeCompare(b.shed || '', undefined, { numeric: true, sensitivity: 'base' });
      if (shedCompare !== 0) return shedCompare;

      // 3. Then by Line
      const lineCompare = (a.line || '').localeCompare(b.line || '', undefined, { numeric: true, sensitivity: 'base' });
      if (lineCompare !== 0) return lineCompare;

      // 4. Chronological order by actual timestamp inside each shed
      const timeA = a.timestamps?.[0] || 0;
      const timeB = b.timestamps?.[0] || 0;
      return timeA - timeB;
    });
    const avgTemp = logs.length > 0 ? Math.round(totalTemp / logs.length) : '—';

    return res.status(200).json({
      success: true,
      availableSheds: ['All sheds', ...allAvailableSheds],
      kpis: {
        totalReadings: logs.length,
        roundsDone: `${rows.length}`,
        avgTemp: avgTemp !== '—' ? `${avgTemp}°C` : '—',
        lowest: minTemp !== null ? `${Math.round(minTemp)}°C` : '—',
        lowestInfo: minSpot || '',
        highest: maxTemp !== null ? `${Math.round(maxTemp)}°C` : '—',
        highestInfo: maxSpot || '',
        alertsCount,
        missedRoundsCount: 0,
      },
      rows,
      logs,
    });
  } catch (error) {
    console.error('Error generating temperature report:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error generating temperature report',
    });
  }
};

/**
 * AI Thermometer Image Scanning using Google Gemini Vision
 * Accepts an image (base64) of a thermometer and automatically detects reading in °C
 */
export const scanThermometerAi = async (req, res) => {
  try {
    const { image, mimeType } = req.body;
    if (!image) {
      return res.status(400).json({
        success: false,
        message: 'Image data is required for thermometer AI scan',
      });
    }

    const result = await extractTemperatureFromImage(image, mimeType);
    if (!result.success) {
      return res.status(result.keyMissing ? 400 : 422).json({
        success: false,
        message: result.error,
        keyMissing: Boolean(result.keyMissing),
      });
    }

    return res.status(200).json({
      success: true,
      message: `Temperature successfully extracted by ${result.modelUsed || 'AI Vision'}`,
      data: result,
    });
  } catch (error) {
    console.error('Error in scanThermometerAi controller:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error processing thermometer scan',
    });
  }
};

/**
 * Delete temperature log(s) - Admin/Dev only
 * Can delete by a specific ID or an array of IDs (e.g. all spot readings in a round row)
 */
export const deleteTemperatureLog = async (req, res) => {
  try {
    const { id } = req.params;
    const { ids } = req.body || {};

    const targetIds = Array.isArray(ids) && ids.length > 0 ? ids : (id ? [id] : []);
    if (targetIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Log ID(s) required for deletion' });
    }

    const deleteResult = await TemperatureLog.deleteMany({ _id: { $in: targetIds } });

    return res.status(200).json({
      success: true,
      message: `Successfully deleted ${deleteResult.deletedCount} temperature reading(s)`,
      deletedCount: deleteResult.deletedCount,
    });
  } catch (error) {
    console.error('Error deleting temperature log:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error deleting temperature reading',
    });
  }
};

/**
 * 7-Day Weekly Temperature Report
 * Returns full readings (Pad Side, Middle, Fan Side) across 7 days for each shed and time round.
 */
export const getWeeklyTemperatureReport = async (req, res) => {
  try {
    const { firm, date, endDate, startDate, shed } = req.query;

    const permittedFirms = getPermittedFirmsForModule(req.user, 'temperature');
    const isAllFirms = firm === 'all';
    let targetFirmIds = [];

    if (isAllFirms) {
      if (permittedFirms === null) {
        targetFirmIds = await Firm.find({ code: { $ne: 'OFFICE' }, name: { $not: /office/i } }).distinct('_id');
      } else {
        const allowed = await Firm.find({ _id: { $in: permittedFirms }, code: { $ne: 'OFFICE' }, name: { $not: /office/i } }).distinct('_id');
        targetFirmIds = allowed;
      }
    } else {
      if (!firm) {
        return res.status(400).json({ success: false, message: 'Farm ID is required' });
      }
      let firmDoc = null;
      if (mongoose.Types.ObjectId.isValid(firm)) {
        firmDoc = await Firm.findById(firm);
      }
      if (!firmDoc) {
        firmDoc = await Firm.findOne({
          $or: [{ code: String(firm).toUpperCase() }, { name: new RegExp('^' + String(firm).trim() + '$', 'i') }],
          code: { $ne: 'OFFICE' },
        });
      }
      if (!firmDoc) {
        firmDoc = await Firm.findOne({ code: { $ne: 'OFFICE' }, name: { $not: /office/i } });
      }
      if (firmDoc) {
        if (permittedFirms !== null && !permittedFirms.includes(String(firmDoc._id))) {
          return res.status(403).json({ success: false, message: 'You do not have access to this farm.' });
        }
        targetFirmIds = [firmDoc._id];
      } else {
        targetFirmIds = mongoose.Types.ObjectId.isValid(firm) ? [firm] : [];
      }
    }

    // Determine target date window in IST
    const tz = 'Asia/Kolkata';
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

    let targetEndStr = (endDate || date || '').trim();
    if (!targetEndStr || !targetEndStr.includes('-')) {
      targetEndStr = todayStr;
    }

    let targetStartStr = (startDate || '').trim();
    if (!targetStartStr || !targetStartStr.includes('-')) {
      const [endY, endM, endD] = targetEndStr.split('-').map(Number);
      targetStartStr = new Date(Date.UTC(endY, endM - 1, endD - 6)).toISOString().slice(0, 10);
    }

    // Ensure valid chronological order
    if (targetStartStr > targetEndStr) {
      const temp = targetStartStr;
      targetStartStr = targetEndStr;
      targetEndStr = temp;
    }

    const [sY, sM, sD] = targetStartStr.split('-').map(Number);
    const [eY, eM, eD] = targetEndStr.split('-').map(Number);
    const startUtc = new Date(Date.UTC(sY, sM - 1, sD));
    const endUtc = new Date(Date.UTC(eY, eM - 1, eD));
    // Limit to max 31 days to ensure fast and responsive performance
    const diffDays = Math.min(Math.round((endUtc - startUtc) / (24 * 60 * 60 * 1000)), 30);

    const days = [];
    for (let i = 0; i <= diffDays; i++) {
      const cur = new Date(Date.UTC(sY, sM - 1, sD + i));
      const curStr = cur.toISOString().slice(0, 10);
      const curDateObj = new Date(`${curStr}T12:00:00+05:30`);
      const dayName = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(curDateObj);
      const dayNum = new Intl.DateTimeFormat('en-US', { timeZone: tz, day: '2-digit' }).format(curDateObj);
      const monthName = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short' }).format(curDateObj);
      days.push({
        date: curStr,
        dayName,
        dayNum,
        monthName,
        label: `${dayName} ${dayNum}`,
        fullLabel: `${dayName}, ${dayNum} ${monthName}`,
        isToday: curStr === todayStr,
      });
    }

    const startStr = days[0].date;
    const dayStart = new Date(`${startStr}T00:00:00+05:30`);
    const dayEnd = new Date(`${targetEndStr}T23:59:59.999+05:30`);

    const query = {
      firm: { $in: targetFirmIds },
      capturedAt: { $gte: dayStart, $lte: dayEnd },
    };
    if (shed && shed !== 'All sheds' && shed !== 'All Sheds') {
      query.shed = shed;
    }

    const logs = await TemperatureLog.find(query)
      .sort({ capturedAt: 1 })
      .populate('firm', 'name code')
      .populate('worker', 'name');

    // Fetch firm details in permitted order (Raghav first, etc.), excluding non-farm Head Office
    const firmDocs = await Firm.find({
      _id: { $in: targetFirmIds },
      code: { $ne: 'OFFICE' },
      name: { $not: /office/i },
    }).sort({ orderIndex: 1, name: 1 });
    const firmsMap = new Map();
    firmDocs.forEach((f) => {
      firmsMap.set(String(f._id), {
        firmId: String(f._id),
        firmName: f.name,
        shedsMap: new Map(),
      });
    });

    const parseSlotMinutes = (slotStr) => {
      if (!slotStr) return 0;
      const match = slotStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return 0;
      let h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const period = match[3].toUpperCase();
      if (period === 'PM' && h < 12) h += 12;
      if (period === 'AM' && h === 12) h = 0;
      return h * 60 + m;
    };

    for (const log of logs) {
      const firmIdStr = String(log.firm?._id || log.firm || '');
      if (!firmsMap.has(firmIdStr)) {
        firmsMap.set(firmIdStr, {
          firmId: firmIdStr,
          firmName: log.firm?.name || 'Farm',
          shedsMap: new Map(),
        });
      }
      const firmEntry = firmsMap.get(firmIdStr);
      const shedName = log.shed;
      const line = log.line || 'Line 1';
      const shedKey = `${shedName}_${line}`;

      if (!firmEntry.shedsMap.has(shedKey)) {
        firmEntry.shedsMap.set(shedKey, {
          shedName,
          line,
          roundsMap: new Map(),
        });
      }
      const shedEntry = firmEntry.shedsMap.get(shedKey);

      const logTime = new Date(log.capturedAt);
      const logDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(logTime);
      const exactTime = formatTimeIST(logTime);
      const roundSlot = log.roundSlot || getHourSlot(logTime);

      if (!shedEntry.roundsMap.has(roundSlot)) {
        shedEntry.roundsMap.set(roundSlot, {
          slot: roundSlot,
          readings: {},
        });
      }
      const round = shedEntry.roundsMap.get(roundSlot);

      if (!round.readings[logDateStr]) {
        round.readings[logDateStr] = {
          pad: null,
          mid: null,
          fan: null,
          exactTimes: {},
          logIds: {},
        };
      }

      const temp = Math.round(Number(log.temperature));
      const pos = log.position;
      if (pos === 'Pad Side') {
        round.readings[logDateStr].pad = temp;
        round.readings[logDateStr].exactTimes.pad = exactTime;
        round.readings[logDateStr].logIds.pad = log._id;
      } else if (pos === 'Middle') {
        round.readings[logDateStr].mid = temp;
        round.readings[logDateStr].exactTimes.mid = exactTime;
        round.readings[logDateStr].logIds.mid = log._id;
      } else if (pos === 'Fan Side') {
        round.readings[logDateStr].fan = temp;
        round.readings[logDateStr].exactTimes.fan = exactTime;
        round.readings[logDateStr].logIds.fan = log._id;
      }
    }

    // Convert to structured response
    const groupedFirms = [];
    for (const firmEntry of firmsMap.values()) {
      const sheds = [];
      for (const shedEntry of firmEntry.shedsMap.values()) {
        const rounds = Array.from(shedEntry.roundsMap.values());
        rounds.sort((a, b) => parseSlotMinutes(a.slot) - parseSlotMinutes(b.slot));
        sheds.push({
          shedName: shedEntry.shedName,
          line: shedEntry.line,
          rounds,
        });
      }

      // Sort sheds naturally (Shed 1, Shed 2, Shed 3...)
      sheds.sort((a, b) => String(a.shedName || '').localeCompare(String(b.shedName || ''), undefined, { numeric: true }));

      groupedFirms.push({
        firmId: firmEntry.firmId,
        firmName: firmEntry.firmName,
        sheds,
      });
    }

    return res.status(200).json({
      success: true,
      startDate: startStr,
      endDate: targetEndStr,
      days,
      firms: groupedFirms,
    });
  } catch (error) {
    console.error('Weekly Temperature Report Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error generating weekly temperature report',
      error: error.message,
    });
  }
};