import TemperatureLog from "../models/TemperatureLog.js";
import ThermometerSpot from "../models/ThermometerSpot.js";
import User from "../../models/User.js";
import Firm from "../../models/Firm.js";
import { extractTemperatureFromImage } from "../services/thermometerAiService.js";
import { getPermittedFirmsForModule } from "../../utils/userFirms.js";

       const getHourSlot = (date = new Date()) => {
       const hours = date.getHours();
       const period = hours >= 12 ? 'PM' : 'AM';
       const displayHours = hours % 12 || 12;
      return `${String(displayHours).padStart(2, '0')}:00 ${period}`;
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
      temperature: Number(temperature),
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
      message: `Temperature ${temperature}°C recorded for ${finalShed} - ${finalPosition}`,
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

    let targetYear, targetMonth, targetDay;
    if (date && typeof date === 'string' && date.includes('-')) {
      const parts = date.split('-');
      targetYear = parseInt(parts[0], 10);
      targetMonth = parseInt(parts[1], 10) - 1;
      targetDay = parseInt(parts[2], 10);
    } else {
      const now = new Date();
      targetYear = now.getFullYear();
      targetMonth = now.getMonth();
      targetDay = now.getDate();
    }

    let dayStart, dayEnd;
    if (shift === 'night') {
      // Night shift spans from 18:00 (6 PM) of target date to 09:00 (9 AM) next morning
      dayStart = new Date(targetYear, targetMonth, targetDay, 18, 0, 0, 0);
      dayEnd = new Date(targetYear, targetMonth, targetDay + 1, 9, 30, 0, 0);
    } else {
      dayStart = new Date(targetYear, targetMonth, targetDay, 0, 0, 0, 0);
      dayEnd = new Date(targetYear, targetMonth, targetDay, 23, 59, 59, 999);
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
      const temp = log.temperature;
      totalTemp += temp;

      const timeStr = new Date(log.capturedAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

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

      const slotKey = log.roundSlot || timeStr;
      const key = `${slotKey}_${firmIdStr}_${log.shed}_${log.line}`;

      if (!rowsMap.has(key)) {
        rowsMap.set(key, {
          slotKey,
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
        row.timestamps.push(new Date(log.capturedAt).getTime());
      }
      if (log.position === 'Pad Side') {
        row.pad = temp;
        row.padVerified = Boolean(log.verifiedByqr);
        row.padLogId = String(log._id);
      }
      if (log.position === 'Middle') {
        row.mid = temp;
        row.midVerified = Boolean(log.verifiedByqr);
        row.midLogId = String(log._id);
      }
      if (log.position === 'Fan Side') {
        row.fan = temp;
        row.fanVerified = Boolean(log.verifiedByqr);
        row.fanLogId = String(log._id);
      }
    }

    // Active spots & sheds for these target firms to detect missed hourly rounds
    const spots = await ThermometerSpot.find({ firm: { $in: targetFirmIds }, active: true }).populate('firm', 'name');
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

    // Standard night slots
    const standardNightSlots = [
      { slot: '08:00 PM', hourOffset: 20 },
      { slot: '09:00 PM', hourOffset: 21 },
      { slot: '10:00 PM', hourOffset: 22 },
      { slot: '11:00 PM', hourOffset: 23 },
      { slot: '12:00 AM', hourOffset: 24 },
      { slot: '01:00 AM', hourOffset: 25 },
      { slot: '02:00 AM', hourOffset: 26 },
      { slot: '03:00 AM', hourOffset: 27 },
      { slot: '04:00 AM', hourOffset: 28 },
      { slot: '05:00 AM', hourOffset: 29 },
      { slot: '06:00 AM', hourOffset: 30 },
      { slot: '07:00 AM', hourOffset: 31 },
    ];

    const now = new Date();
    let missedRoundsCount = 0;

    if (shift === 'night' && shedLines.length > 0) {
      for (const { slot, hourOffset } of standardNightSlots) {
        // Calculate date/time this slot represents
        const slotDate = new Date(targetYear, targetMonth, targetDay, hourOffset, 0, 0, 0);
        const hasPassed = slotDate <= now || dayEnd < now;

        for (const sl of shedLines) {
          const key = `${slot}_${sl.firmId}_${sl.shed}_${sl.line}`;
          if (!rowsMap.has(key)) {
            // If the time has passed, mark as missed round
            if (hasPassed) {
              missedRoundsCount++;
              rowsMap.set(key, {
                slotKey: slot,
                time: slot,
                rawTime: slotDate,
                firmId: sl.firmId,
                firmName: sl.firmName,
                shedLine: isAllFirms ? `${sl.firmName} · ${sl.shed} · ${sl.line}` : `${sl.shed} · ${sl.line}`,
                shed: sl.shed,
                line: sl.line,
                pad: null,
                mid: null,
                fan: null,
                avg: '—',
                worker: '—',
                status: 'Missed',
                missed: true,
              });
            }
          }
        }
      }
    }

    const slotOrder = {
      '08:00 PM': 0, '09:00 PM': 1, '10:00 PM': 2, '11:00 PM': 3,
      '12:00 AM': 4, '01:00 AM': 5, '02:00 AM': 6, '03:00 AM': 7,
      '04:00 AM': 8, '05:00 AM': 9, '06:00 AM': 10, '07:00 AM': 11,
    };

    const rows = Array.from(rowsMap.values()).map((row) => {
      if (row.missed) return row;
      const vals = [row.pad, row.mid, row.fan].filter((v) => v !== null && v !== undefined);
      const avg = vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';

      // Calculate true display time (average time across the taken readings)
      let displayTime = row.time;
      let timeSpan = '';
      if (row.timestamps && row.timestamps.length > 0) {
        if (row.timestamps.length === 1) {
          // Single reading: show exact capture time
          displayTime = new Date(row.timestamps[0]).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
        } else {
          // Multiple readings: show average round time
          const avgMillis = Math.round(
            row.timestamps.reduce((sum, t) => sum + t, 0) / row.timestamps.length
          );
          displayTime = new Date(avgMillis).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });

          const minTime = new Date(Math.min(...row.timestamps)).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
          const maxTime = new Date(Math.max(...row.timestamps)).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
          timeSpan = `${minTime} – ${maxTime}`;
        }
      }

      return {
        ...row,
        time: displayTime,
        timeSpan,
        avg: avg !== '—' ? Number(avg) : '—',
      };
    });

    // Sort: First by Firm Name (e.g. Raghav, Sanjana), then by Time Slot, then Shed, then Line
    rows.sort((a, b) => {
      // 1. Group by Firm Name
      const firmCompare = (a.firmName || '').localeCompare(b.firmName || '');
      if (firmCompare !== 0) return firmCompare;

      // 2. Then chronological time slot within each farm
      const keyA = a.slotKey || a.time;
      const keyB = b.slotKey || b.time;
      const orderA = slotOrder[keyA] !== undefined ? slotOrder[keyA] : 999;
      const orderB = slotOrder[keyB] !== undefined ? slotOrder[keyB] : 999;
      if (orderA !== orderB) return orderA - orderB;

      // 3. Then by Shed and Line
      if (a.shed !== b.shed) return a.shed.localeCompare(b.shed);
      return (a.line || '').localeCompare(b.line || '');
    });

    const recordedRows = rows.filter((r) => !r.missed);
    const totalExpectedSlots = shedLines.length > 0 ? standardNightSlots.length * shedLines.length : 12;
    const avgTemp = logs.length > 0 ? (totalTemp / logs.length).toFixed(1) : '—';

    return res.status(200).json({
      success: true,
      kpis: {
        totalReadings: logs.length,
        roundsDone: `${recordedRows.length} of ${Math.max(recordedRows.length + missedRoundsCount, 12)}`,
        avgTemp: avgTemp !== '—' ? `${avgTemp}°C` : '—',
        lowest: minTemp !== null ? `${minTemp}°C` : '—',
        lowestInfo: minSpot || '',
        highest: maxTemp !== null ? `${maxTemp}°C` : '—',
        highestInfo: maxSpot || '',
        alertsCount: alertsCount + missedRoundsCount,
        missedRoundsCount,
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




