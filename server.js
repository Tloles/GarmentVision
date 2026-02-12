require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const anthropic = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Detection endpoint — lightweight check: is there a garment or label in frame?
app.post('/api/detect', async (req, res) => {
  try {
    const { image, mode } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    let prompt;
    if (mode === 'garment') {
      prompt = `Look at this image. Is there a clear, stable, well-lit garment visible in the frame?
The garment should be reasonably still (not blurry from motion) and clearly visible.
Respond with ONLY a JSON object: {"detected": true} or {"detected": false}`;
    } else if (mode === 'label') {
      prompt = `Look at this image. Is there a garment care label or tag visible?

Answer YES (detected: true) if you see ANY of the following:
- A sewn-in fabric tag or label on a garment
- Standardized care symbols (washtub, triangle, circle, square, iron icons)
- Text listing fiber/material content (e.g. "100% Cotton", "Polyester")
- Any printed or woven label with washing/care instructions
- A small tag with text or symbols, even if partially visible

Be generous — if there is any kind of garment tag or label visible, even small or at an angle, answer true.

Respond with ONLY a JSON object: {"detected": true} or {"detected": false}`;
    } else {
      return res.status(400).json({ error: 'Invalid mode. Use "garment" or "label".' });
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: image,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    const text = message.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      res.json(JSON.parse(jsonMatch[0]));
    } else {
      res.json({ detected: false });
    }
  } catch (err) {
    console.error('Detection error:', err.status, err.message);
    if (err.error) console.error('Details:', JSON.stringify(err.error));
    const detail = err.status === 401 ? 'Invalid API key' :
                   err.status === 429 ? 'Rate limited — slow down' :
                   err.message || 'Unknown error';
    res.status(500).json({ error: `Detection failed: ${detail}` });
  }
});

// Full garment analysis endpoint
app.post('/api/analyze/garment', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: image,
              },
            },
            {
              type: 'text',
              text: `Analyze this garment image. Extract the following details:
- garmentType: The type of garment (shirt, suit, dress, jacket, trousers, blouse, coat, skirt, tie, sweater, etc.)
- color: The primary color(s) of the garment
- brand: The brand if visible on any label or tag, otherwise "Not visible"

Respond with ONLY a JSON object in this exact format:
{"garmentType": "...", "color": "...", "brand": "..."}`,
            },
          ],
        },
      ],
    });

    const text = message.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      res.json(JSON.parse(jsonMatch[0]));
    } else {
      res.status(500).json({ error: 'Could not parse garment analysis' });
    }
  } catch (err) {
    console.error('Garment analysis error:', err.status, err.message);
    if (err.error) console.error('Details:', JSON.stringify(err.error));
    const detail = err.status === 401 ? 'Invalid API key' :
                   err.status === 429 ? 'Rate limited — slow down' :
                   err.message || 'Unknown error';
    res.status(500).json({ error: `Garment analysis failed: ${detail}` });
  }
});

// Damage analysis endpoint
app.post('/api/analyze/damage', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: image,
              },
            },
            {
              type: 'text',
              text: `Examine this close-up image of garment damage. Describe what you see:
- What type of damage is it? (stain, tear, hole, discoloration, missing button, worn area, etc.)
- Where on the garment does it appear to be?
- How severe is it? (minor, moderate, severe)
- Any other relevant observations for the dry cleaner.

Respond with ONLY a JSON object:
{"type": "...", "location": "...", "severity": "...", "description": "..."}`,
            },
          ],
        },
      ],
    });

    const text = message.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      res.json(JSON.parse(jsonMatch[0]));
    } else {
      res.status(500).json({ error: 'Could not parse damage analysis' });
    }
  } catch (err) {
    console.error('Damage analysis error:', err.status, err.message);
    if (err.error) console.error('Details:', JSON.stringify(err.error));
    const detail = err.status === 401 ? 'Invalid API key' :
                   err.status === 429 ? 'Rate limited — slow down' :
                   err.message || 'Unknown error';
    res.status(500).json({ error: `Damage analysis failed: ${detail}` });
  }
});

// Care label analysis endpoint
app.post('/api/analyze/label', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: image,
              },
            },
            {
              type: 'text',
              text: `Read this garment care label carefully. It may contain text, standardized care symbols, or both.

STANDARDIZED CARE SYMBOLS TO LOOK FOR:
- WASHTUB (bucket shape): washing instructions. Number inside = max temperature. Hand in tub = hand wash. X through it = do not wash.
- TRIANGLE: bleaching. Empty = any bleach OK. Lines inside = non-chlorine only. X through it = do not bleach.
- CIRCLE: dry cleaning. Letter inside (P, F, W) = solvent type. X through it = do not dry clean.
- SQUARE: drying. Circle inside = tumble dry. Lines = line dry/flat dry. X through it = do not tumble dry. Dots inside circle = heat level.
- IRON: ironing. Dots inside = heat level (1=low, 2=medium, 3=high). X through it = do not iron.

Extract ALL of the following from both text AND symbols:
- fiberContent: Materials/fibers (e.g., "100% Cotton", "65% Polyester, 35% Cotton")
- dryClean: Dry cleaning instructions
- washing: Washing instructions (include temperature if shown)
- drying: Drying instructions
- ironing: Ironing instructions
- bleaching: Bleaching instructions

If a field is not present on the label, use "Not specified".

Respond with ONLY a JSON object:
{"fiberContent": "...", "dryClean": "...", "washing": "...", "drying": "...", "ironing": "...", "bleaching": "..."}`,
            },
          ],
        },
      ],
    });

    const text = message.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      res.json(JSON.parse(jsonMatch[0]));
    } else {
      res.status(500).json({ error: 'Could not parse label analysis' });
    }
  } catch (err) {
    console.error('Label analysis error:', err.status, err.message);
    if (err.error) console.error('Details:', JSON.stringify(err.error));
    const detail = err.status === 401 ? 'Invalid API key' :
                   err.status === 429 ? 'Rate limited — slow down' :
                   err.message || 'Unknown error';
    res.status(500).json({ error: `Label analysis failed: ${detail}` });
  }
});

app.listen(PORT, () => {
  console.log(`Garment Intake Server running at http://localhost:${PORT}`);
});
