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
              text: `You are a garment analyst for a professional dry cleaning intake system. Analyze this image with precision and consistency.

═══════════════════════════════════════════════════════════════
GARMENT TYPE CLASSIFICATION
═══════════════════════════════════════════════════════════════

Select EXACTLY ONE category from this list. Do not create new categories or combine categories.

**SHIRTS & TOPS:**
• Shirt Laundered — Casual button-up shirts (oxford cloth, chambray, denim shirts) that will be machine washed and pressed
• Shirt Dry Clean — Dress shirts requiring dry cleaning due to delicate fabric, special finish, or construction
• Dress Shirt — Formal button-up shirts, typically worn with suits (white, solid colors, subtle patterns)
• Blouse — Women's tops (button-up or pullover), typically dressier than casual shirts
• Golf Shirt — Polo shirts, collared knit shirts with short or long sleeves
• Tee Shirt — Casual t-shirts (crew neck, v-neck, graphic tees)

**SWEATERS & KNITS:**
• Sweater — Pullover sweaters, v-neck sweaters, crew neck sweaters (standard weight)
• Cardigan — Open-front sweaters with buttons, zippers, or no closure

**PANTS & BOTTOMS:**
• Pants — Dress pants, slacks, chinos, khakis (business casual or dressier)
• Trousers — Formal suit trousers, part of a matching suit
• Jeans — Denim pants (any style)
• Shorts — Any type of shorts (dress shorts, cargo shorts, athletic shorts)

**JACKETS & OUTERWEAR:**
• Blazer — Structured tailored jacket, typically solid color, can be worn separately from a suit
• Sport Coat — Less formal than blazer, often textured fabric or bold pattern (tweed, herringbone, plaid)
• Jacket - Lightweight — Spring/fall jackets, windbreakers, bomber jackets, unlined jackets
• Outer Coat - Long — Winter coats, overcoats, trench coats, parkas, peacoats (typically knee-length or longer)

**VESTS:**
• Suit Vest — Matching vest from a 3-piece suit, formal waistcoat
• Vest — Standalone vests, sweater vests, puffer vests, utility vests

**DRESSES & SKIRTS:**
• Dress - Everyday — Casual dresses, sundresses, business dresses, cocktail dresses (knee-length or shorter)
• Dress - Long — Formal gowns, evening dresses, maxi dresses, wedding dresses (typically floor-length)
• Skirt - Everyday — Any type of skirt (A-line, pencil, pleated, mini, midi)

**SPECIALTY ITEMS:**
• Tie — Neckties, bow ties
• Robe — Bathrobes, dressing gowns, kimono robes
• Chef Jacket — White double-breasted kitchen uniform jacket
• Apron — Kitchen aprons, work aprons, bib aprons
• Belt — Leather or fabric belts
• Tablecloth — Dining table linens
• Socks — Any type of socks

**CLASSIFICATION DECISION TREE:**
1. If it's a shirt worn with a suit → "Dress Shirt"
2. If it's a casual shirt that can be laundered → "Shirt Laundered"
3. If it's a delicate shirt needing dry cleaning → "Shirt Dry Clean"
4. If it's a women's dressy top → "Blouse"
5. If it has a suit jacket + matching pants visible → the jacket is "Blazer" (or "Sport Coat" if textured/patterned), pants are "Trousers"
6. If pants are denim → "Jeans"
7. If pants are dressy but not part of a suit → "Pants"
8. When uncertain between two similar categories, choose the MORE COMMON one

═══════════════════════════════════════════════════════════════
COLOR IDENTIFICATION
═══════════════════════════════════════════════════════════════

Identify the PRIMARY color using standard color names. Be specific but use common terms.

**Standard colors to use:**
White, Black, Navy, Gray, Charcoal, Brown, Tan, Khaki, Beige, Cream, Red, Burgundy, Blue, Light Blue, Royal Blue, Green, Olive, Forest Green, Yellow, Gold, Pink, Purple, Lavender, Orange, Rust

**For patterns:**
- Identify the dominant BACKGROUND color (e.g., "Navy" for navy pinstripe, "Blue" for blue plaid)
- Do not describe the pattern itself, just the primary color

**For multi-colored items:**
- Choose the single most dominant color
- Example: A blue shirt with white collar → "Blue"

═══════════════════════════════════════════════════════════════
BRAND IDENTIFICATION
═══════════════════════════════════════════════════════════════

ONLY report a brand if you can CLEARLY READ a visible brand name on:
- A sewn-in label
- An embroidered logo
- A printed brand name on the fabric
- A visible tag still attached to the garment

**DO NOT:**
- Guess based on style or appearance
- Assume a brand from garment quality
- Report a brand if the logo is unclear or partially visible
- Make up brand names

If you cannot clearly read a brand name, return null.

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

Return ONLY valid JSON with no additional text:

{
  "garmentType": "exact category name from the list above",
  "color": "primary color using standard color names",
  "brand": "Brand Name" or null
}

**Examples of correct responses:**

{"garmentType": "Dress Shirt", "color": "White", "brand": "Brooks Brothers"}
{"garmentType": "Jeans", "color": "Navy", "brand": null}
{"garmentType": "Blazer", "color": "Charcoal", "brand": null}
{"garmentType": "Blouse", "color": "Pink", "brand": "J.Crew"}
{"garmentType": "Outer Coat - Long", "color": "Black", "brand": null}`,
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
