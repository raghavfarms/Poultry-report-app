import {api} from '../../api/client.js'

export async function fetchSpots(firmId){
      if (!firmId) return { data: [] };
  return await api(`/temperature/spots?firm=${encodeURIComponent(firmId)}`);
}


export async function createSpot(spotData) {
  return await api('/temperature/spots', {
    method: 'POST',
    body: spotData,
  });
}

export async function quickSetupSpots(setupData) {
  return await api('/temperature/spots/quick-setup', {
    method: 'POST',
    body: setupData,
  });
}


export async function deleteSpot(spotId) {
  return await api(`/temperature/spots/${spotId}`, {
    method: 'DELETE',
  });
}

// Spot ki details (Shed, Line, Position, Spot Code) update karne ke liye (PUT)
export async function updateSpot(spotId, spotData) {
  return await api(`/temperature/spots/${spotId}`, {
    method: 'PUT',
    body: spotData,
  }) }

// Spot ko Activate / Deactivate karne ke liye (PATCH)
export async function toggleSpotStatus(spotId) {
  return await api(`/temperature/spots/${spotId}/toggle-status`, {
    method: 'PATCH',
  });
}

// Record temperature reading (QR verified or manual)
export async function recordTemperature(logData) {
  return await api('/temperature/logs', {
    method: 'POST',
    body: logData,
  });
}

// Fetch recent readings to show round progress checklist
export async function fetchRecentLogs(firmId, shed = '') {
  if (!firmId) return { data: [] };
  let url = `/temperature/logs/recent?firm=${encodeURIComponent(firmId)}`;
  if (shed) url += `&shed=${encodeURIComponent(shed)}`;
  return await api(url);
}

// Fetch 6-column night temperature report with KPIs
export async function fetchTemperatureReport(firmId, date = '', shed = '', shift = 'all') {
  if (!firmId) return { success: false, rows: [], kpis: {} };
  let url = `/temperature/logs/report?firm=${encodeURIComponent(firmId)}`;
  if (date) url += `&date=${encodeURIComponent(date)}`;
  if (shed && shed !== 'All sheds' && shed !== 'All Sheds') {
    url += `&shed=${encodeURIComponent(shed)}`;
  }
  if (shift) {
    url += `&shift=${encodeURIComponent(shift)}`;
  }
  return await api(url);
}
