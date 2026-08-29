export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(error, req, res, next) {
  console.error(error);
  if (error?.code === 11000) {
    return res.status(409).json({ message: 'A record with this value already exists.' });
  }
  if (error?.name === 'ValidationError') {
    const message = Object.values(error.errors).map((item) => item.message).join(' ');
    return res.status(400).json({ message });
  }
  res.status(error.status || 500).json({
    message: error.status ? error.message : 'Something went wrong on the server.',
  });
}

