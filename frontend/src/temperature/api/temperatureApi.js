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

  //Spot ko Activate / Deactivate karne ke liye (PATCH)
export async function toggleSpotStatus(spotId) {
  return await api(`/temperature/spots/${spotId}/toggle-status`, {
    method: 'PATCH',
  });
}
