import TemperatureLog from "../models/TemperatureLog.js";
import ThermometerSpot from "../models/ThermometerSpot.js";
import User from "../../models/User.js";
import Firm from "../../models/Firm.js";


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
                temperature,verifiedQr
             }=req.body;

            if (!firm) {
                return res.status(400).json({ success: false, message: 'Farm ID is required' });
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
      verifiedByqr: Boolean(verifiedQr),
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
    if (!firm) {
      return res.status(400).json({ success: false, message: 'Firm is required' });
    }
    const query = { firm };
    if (shed) query.shed = shed;
    const logs = await TemperatureLog.find(query)
      .sort({ capturedAt: -1 })
      .limit(Number(limit))
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
      firm,
      capturedAt: { $gte: dayStart, $lte: dayEnd },
    };
    if (shed && shed !== 'All sheds' && shed !== 'All Sheds') {
      query.shed = shed;
    }

    const logs = await TemperatureLog.find(query)
      .sort({ capturedAt: 1 })
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

      if (minTemp === null || temp < minTemp) {
        minTemp = temp;
        minSpot = `${log.shed} · ${timeStr}`;
      }
      if (maxTemp === null || temp > maxTemp) {
        maxTemp = temp;
        maxSpot = `${log.shed} · ${timeStr}`;
      }
      if (temp < 22 || temp > 30) {
        alertsCount++;
      }

      const slotKey = log.roundSlot || timeStr;
      const key = `${slotKey}_${log.shed}_${log.line}`;

      if (!rowsMap.has(key)) {
        rowsMap.set(key, {
          time: slotKey,
          rawTime: log.capturedAt,
          shedLine: `${log.shed} · ${log.line}`,
          shed: log.shed,
          line: log.line,
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
      if (log.position === 'Pad Side') {
        row.pad = temp;
        row.padVerified = Boolean(log.verifiedByqr);
      }
      if (log.position === 'Middle') {
        row.mid = temp;
        row.midVerified = Boolean(log.verifiedByqr);
      }
      if (log.position === 'Fan Side') {
        row.fan = temp;
        row.fanVerified = Boolean(log.verifiedByqr);
      }
    }

    // Active spots & sheds for this farm to detect missed hourly rounds
    const spots = await ThermometerSpot.find({ firm, active: true });
    let shedLines = [];
    const shedLineSet = new Set();
    for (const sp of spots) {
      if (shed && shed !== 'All sheds' && shed !== 'All Sheds' && sp.shed !== shed) {
        continue;
      }
      const slKey = `${sp.shed}_${sp.line}`;
      if (!shedLineSet.has(slKey)) {
        shedLineSet.add(slKey);
        shedLines.push({ shed: sp.shed, line: sp.line });
      }
    }
    // Fallback if no spots set up yet: extract from logs
    if (shedLines.length === 0) {
      for (const log of logs) {
        const slKey = `${log.shed}_${log.line}`;
        if (!shedLineSet.has(slKey)) {
          shedLineSet.add(slKey);
          shedLines.push({ shed: log.shed, line: log.line });
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
          const key = `${slot}_${sl.shed}_${sl.line}`;
          if (!rowsMap.has(key)) {
            // If the time has passed, mark as missed round
            if (hasPassed) {
              missedRoundsCount++;
              rowsMap.set(key, {
                time: slot,
                rawTime: slotDate,
                shedLine: `${sl.shed} · ${sl.line}`,
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
      return {
        ...row,
        avg: avg !== '—' ? Number(avg) : '—',
      };
    });

    // Chronological sorting
    rows.sort((a, b) => {
      const orderA = slotOrder[a.time] !== undefined ? slotOrder[a.time] : 999;
      const orderB = slotOrder[b.time] !== undefined ? slotOrder[b.time] : 999;
      if (orderA !== orderB) return orderA - orderB;
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


