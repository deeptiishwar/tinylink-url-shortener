console.log("Starting TinyLink server...");
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});


// IMPORTANT PART: SSL for Neon/Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Important: allows connection to Neon cloud
  }
});

app.use(cors());
app.use(express.json());

// Health check
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

// Create a new short link
app.post('/api/links', async (req, res) => {
  const { code, url } = req.body;

  if (!code || !url) {
    return res.status(400).json({ error: 'Code and URL are required' });
  }

  try {
    const existing = await pool.query('SELECT * FROM links WHERE code = $1', [code]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Code already exists' });
    }
    await pool.query('INSERT INTO links (code, url) VALUES ($1, $2)', [code, url]);
    res.status(201).json({ code, url });
  } catch (error) {
    console.error("Error in POST /api/links", error);
    res.status(500).json({ error: 'Server error' });
  }
});

// List all links
app.get('/api/links', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM links ORDER BY code');
    res.json(result.rows);
  } catch (error) {
    console.error("Error in GET /api/links", error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Redirect to original URL and count clicks
app.get('/:code', async (req, res) => {
  const code = req.params.code;
  try {
    const result = await pool.query('SELECT * FROM links WHERE code = $1', [code]);
    if (result.rows.length === 0) {
      return res.status(404).send('Link not found');
    }
    const link = result.rows[0];
    await pool.query('UPDATE links SET clicks = clicks + 1, last_clicked = NOW() WHERE code = $1', [code]);
    res.redirect(link.url);
  } catch (error) {
    console.error("Error in GET /:code", error);
    res.status(500).send('Server error');
  }
});

// Delete a link
app.delete('/api/links/:code', async (req, res) => {
  const code = req.params.code;
  try {
    const result = await pool.query('DELETE FROM links WHERE code = $1 RETURNING *', [code]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }
    res.json({ message: 'Link deleted' });
  } catch (error) {
    console.error("Error in DELETE /api/links/:code", error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GLOBAL ERROR HANDLERS
process.on('uncaughtException', error => {
  console.error("Uncaught Exception:", error);
});
process.on('unhandledRejection', error => {
  console.error("Unhandled Rejection:", error);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
