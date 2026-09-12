import { forbidden } from '../lib/http.js';

export const requireAdmin = (req, _res, next) => {
  if (req.user?.role !== 'admin') throw forbidden('Admin access required');
  next();
};
