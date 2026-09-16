import mongoose from 'mongoose';
import { badRequest } from '../utils/http.js';

export function objectId(value, label = 'ID') {
  if (value instanceof mongoose.Types.ObjectId) return value;
  const raw = value && typeof value === 'object' && value._id ? value._id : value;
  if (raw instanceof mongoose.Types.ObjectId) return raw;
  const str = typeof raw === 'string' ? raw : (raw && typeof raw.toString === 'function' ? raw.toString() : '');
  if (!/^[a-f\d]{24}$/i.test(str)) throw badRequest(`${label} is invalid.`);
  return new mongoose.Types.ObjectId(str);
}

export function text(value, label, max, required = false) {
  if (typeof value !== 'string') throw badRequest(`${label} must be text.`);
  const result = value.trim();
  if ((required && !result) || result.length > max) throw badRequest(`${label} must contain ${required ? '1' : '0'}–${max} characters.`);
  return result;
}

function boolean(value, label) {
  if (typeof value !== 'boolean') throw badRequest(`${label} must be true or false.`);
  return value;
}

export function dateOnly(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw badRequest(`${label} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw badRequest(`${label} is invalid.`);
  return value;
}

function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('A JSON object is required.');
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw badRequest('The request contains unsupported or read-only fields.');
  if (!Object.keys(body).length) throw badRequest('Enter at least one field.');
}

export function masterPayload(kind, body, create = false) {
  const allowed = ['name', 'active', ...(create || kind === 'geofences' ? ['firmId'] : [])];
  if (kind === 'work-locations') allowed.push('type', 'supervisor', 'remarks', 'order', 'birdCapacity');
  if (kind === 'geofences') allowed.push('latitude', 'longitude', 'radiusMetres', 'isOfficeTesting', 'remarks', 'order');
  fields(body, allowed);
  const result = {};
  if (create) {
    if (kind === 'geofences') {
      result.firm = body.firmId ? objectId(body.firmId, 'Firm') : null;
    } else {
      result.firm = objectId(body.firmId, 'Firm');
    }
  } else if (kind === 'geofences' && body.firmId !== undefined) {
    result.firm = body.firmId ? objectId(body.firmId, 'Firm') : null;
  }
  if (create || body.name !== undefined) {
    result.name = text(body.name, 'Name', 100, true).replace(/\s+/g, ' ');
    result.nameKey = result.name.toLowerCase();
  }
  if (body.active !== undefined) result.active = boolean(body.active, 'Active');
  if (kind === 'work-locations') {
    if (body.birdCapacity !== undefined) {
      result.birdCapacity = null;
      if (body.birdCapacity !== null) {
        fields(body.birdCapacity, ['male', 'female']);
        for (const key of ['male', 'female']) {
          const count = body.birdCapacity[key];
          if (!Number.isSafeInteger(count) || count < 0 || count > 1000000000) {
            throw badRequest('Male and female bird capacities must each be whole numbers from 0 to 1,000,000,000.');
          }
        }
        result.birdCapacity = { male: body.birdCapacity.male, female: body.birdCapacity.female };
      }
    }
    if (create || body.type !== undefined) {
      if (!['SHED', 'MISCELLANEOUS'].includes(body.type)) throw badRequest('Choose SHED or MISCELLANEOUS.');
      result.type = body.type;
    }
    if (body.supervisor !== undefined) result.supervisor = body.supervisor === null ? null : objectId(body.supervisor, 'Supervisor');
    if (body.remarks !== undefined) result.remarks = text(body.remarks, 'Remarks', 1000);
    if (body.order !== undefined) {
      if (!Number.isSafeInteger(body.order) || body.order < 0) throw badRequest('Order must be a non-negative integer.');
      result.order = body.order;
    }
  }
  if (kind === 'geofences') {
    if (create || body.latitude !== undefined) {
      const lat = Number(body.latitude);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw badRequest('Latitude must be a valid number between -90 and 90.');
      result.latitude = lat;
    }
    if (create || body.longitude !== undefined) {
      const lon = Number(body.longitude);
      if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw badRequest('Longitude must be a valid number between -180 and 180.');
      result.longitude = lon;
    }
    if (body.radiusMetres !== undefined) {
      const rad = Number(body.radiusMetres);
      if (!Number.isFinite(rad) || rad < 10 || rad > 50000) throw badRequest('Radius must be between 10 and 50,000 metres.');
      result.radiusMetres = Math.round(rad);
    } else if (create) {
      result.radiusMetres = 500;
    }
    if (body.isOfficeTesting !== undefined) {
      result.isOfficeTesting = boolean(body.isOfficeTesting, 'Office testing');
    }
    if (body.remarks !== undefined) result.remarks = text(body.remarks, 'Remarks', 1000);
    if (body.order !== undefined) {
      if (!Number.isSafeInteger(body.order) || body.order < 0) throw badRequest('Order must be a non-negative integer.');
      result.order = body.order;
    }
  }
  return result;
}

export function workerPayload(body, create = false) {
  fields(body, [
    'fullName', 'fatherOrHusbandName', 'gender', 'mobileNumber', 'address', 'photographUrl',
    'dateOfJoining', 'designation', 'isSupervisor', 'active', 'leavingDate', 'inactiveReason',
    'remarks', 'referenceName', 'referenceMobile', 'aadhaarNumber', 'bankDetails', ...(create ? ['firmId', 'initialDeployment'] : []),
  ]);
  const result = {};
  if (create) result.firm = objectId(body.firmId, 'Firm');
  if (create || body.fullName !== undefined) result.fullName = text(body.fullName, 'Full name', 120, true);
  if (body.dateOfJoining) {
    result.dateOfJoining = dateOnly(body.dateOfJoining, 'Date of joining');
  } else if (body.dateOfJoining === null || body.dateOfJoining === '' || create) {
    result.dateOfJoining = null;
  }
  if (create || body.designation !== undefined) result.designation = objectId(body.designation, 'Designation');
  for (const key of ['fatherOrHusbandName', 'address', 'inactiveReason', 'remarks', 'referenceName']) {
    if (body[key] !== undefined) result[key] = text(body[key], key, key === 'address' || key === 'inactiveReason' || key === 'remarks' ? 1000 : 120);
  }
  for (const key of ['active', 'isSupervisor']) if (body[key] !== undefined) result[key] = boolean(body[key], key);
  if (body.gender !== undefined) {
    if (!['MALE', 'FEMALE', 'OTHER', 'NOT_SPECIFIED'].includes(body.gender)) throw badRequest('Gender is invalid.');
    result.gender = body.gender;
  }
  if (body.mobileNumber !== undefined) {
    result.mobileNumber = text(body.mobileNumber, 'Mobile number', 16).replace(/[\s-]/g, '');
    if (!/^(?:\+?\d{10,15})?$/.test(result.mobileNumber)) throw badRequest('Enter a valid mobile number.');
  }
  if (body.referenceMobile !== undefined) {
    if (body.referenceMobile === null || body.referenceMobile === '') {
      result.referenceMobile = '';
    } else {
      result.referenceMobile = text(body.referenceMobile, 'Reference mobile', 16).replace(/[\s-]/g, '');
      if (!/^(?:\+?\d{10,15})?$/.test(result.referenceMobile)) throw badRequest('Enter a valid reference mobile number.');
    }
  }
  if (body.leavingDate !== undefined) result.leavingDate = body.leavingDate === null ? null : dateOnly(body.leavingDate, 'Leaving date');
  if (body.photographUrl !== undefined) {
    result.photographUrl = text(body.photographUrl, 'Photograph URL', 2048);
    if (result.photographUrl) {
      let url;
      try { url = new URL(result.photographUrl); } catch { throw badRequest('Photograph must be an HTTPS file URL.'); }
      if (url.protocol !== 'https:' || url.username || url.password) throw badRequest('Photograph must be an HTTPS file URL.');
    }
  }
  if (body.aadhaarNumber !== undefined) {
    if (body.aadhaarNumber === null || body.aadhaarNumber === '') result.aadhaarNumber = undefined;
    else {
      result.aadhaarNumber = text(body.aadhaarNumber, 'Aadhaar number', 12);
      if (!/^[2-9]\d{11}$/.test(result.aadhaarNumber)) throw badRequest('Aadhaar number must contain 12 digits and start with 2–9.');
    }
  }
  if (body.bankDetails !== undefined) {
    if (body.bankDetails === null) result.bankDetails = undefined;
    else {
      fields(body.bankDetails, ['accountHolderName', 'bankName', 'accountNumber', 'ifsc', 'branch']);
      result.bankDetails = {};
      for (const key of ['accountHolderName', 'bankName', 'accountNumber', 'ifsc', 'branch']) {
        if (body.bankDetails[key] !== undefined) result.bankDetails[key] = text(body.bankDetails[key], key, 120, true);
      }
      if (!/^\d{6,25}$/.test(result.bankDetails.accountNumber || '')) throw badRequest('Bank account number must contain 6–25 digits.');
      result.bankDetails.ifsc = (result.bankDetails.ifsc || '').toUpperCase();
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(result.bankDetails.ifsc)) throw badRequest('Enter a valid IFSC code.');
    }
  }
  return result;
}

export function validateWorkerDates(worker) {
  if (worker.leavingDate && worker.dateOfJoining && worker.leavingDate < worker.dateOfJoining) {
    throw badRequest('Leaving date cannot be before joining date.');
  }
  if (worker.active && worker.leavingDate) throw badRequest('An active worker cannot have a leaving date. Clear it when reactivating.');
}

export function pagination(query) {
  const read = (value, fallback) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw badRequest('Invalid pagination.');
    return Number(value);
  };
  const page = read(query.page, 1);
  const limit = read(query.limit, 25);
  if (limit < 1 || limit > 1000 || page > 1000000) throw badRequest('Use a valid page and a limit between 1 and 1000.');
  return { page, limit, skip: (page - 1) * limit };
}

export function searchFilter(query, keys) {
  const filter = {};
  if (query.active !== undefined) {
    if (!['true', 'false'].includes(query.active)) throw badRequest('Active filter must be true or false.');
    filter.active = query.active === 'true';
  }
  if (query.search !== undefined) {
    const search = text(query.search, 'Search', 100);
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = keys.map((key) => ({ [key]: { $regex: escaped, $options: 'i' } }));
    }
  }
  return filter;
}
