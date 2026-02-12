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
      prompt = `You are a garment detection system for a dry cleaning intake process.

TASK: Determine if this frame shows a garment that is READY TO BE ANALYZED for check-in.

A garment is READY only if ALL of these conditions are met:

✓ ISOLATED PRESENTATION: The garment is being held up, laid flat, or displayed on its own
  • NOT worn on a person's body
  • NOT hanging in a closet in the background
  • NOT draped over furniture
  • Being actively presented to the camera for inspection

✓ FILLS THE FRAME: The garment occupies at least 40% of the image
  • You can see the full shape and type of garment
  • Not a distant or partial view
  • Main focus of the image

✓ SHARP AND STABLE: The image is clear, not blurry
  • No motion blur from movement
  • In focus enough to identify fabric texture
  • Garment is reasonably still

✓ WELL LIT: Lighting allows you to see color and details
  • Not too dark or shadowy
  • Not harsh glare obscuring the fabric
  • Can distinguish fabric color accurately

REJECT the frame if:
✗ Someone is wearing the garment (even if held in front of them)
✗ The garment is in the background (on a hanger, chair, bed, etc.)
✗ Only a small portion is visible (sleeve, collar, edge)
✗ The image is blurry, dark, or overexposed
✗ The garment is bunched, crumpled, or shape is unclear
✗ You're seeing the person checking in, not the garment they're about to scan

IMPORTANT: We are looking for a garment being actively PRESENTED for intake scanning. A person standing in front of the camera wearing their shirt is NOT what we want.

Respond with ONLY a JSON object:
{"detected": true, "reason": "brief note"} or {"detected": false, "reason": "brief note"}

Examples:
{"detected": true, "reason": "Dress shirt held up clearly in frame"}
{"detected": false, "reason": "Person wearing shirt, not presenting for scan"}
{"detected": false, "reason": "Garment hanging in background"}
{"detected": false, "reason": "Motion blur, image not stable"}
{"detected": false, "reason": "Only partial view of sleeve visible"}`;
    } else if (mode === 'label') {
      prompt = `You are a care label detection system for professional garment intake. Your job is to identify if a garment care label is visible and ready to be analyzed.

═══════════════════════════════════════════════════════════════
WHAT IS A CARE LABEL?
═══════════════════════════════════════════════════════════════

A care label is a tag attached to a garment (sewn-in, printed, or woven) that contains:

**PRIMARY INDICATORS (if you see ANY of these, it's a care label):**
✓ ISO standardized care symbols (the internationally recognized icons):
  • WASHING: Washtub/basin icon (may have temperature numbers, hand symbol, or X through it)
  • BLEACHING: Triangle icon (empty, with lines, or X through it)
  • DRYING: Square icon (may contain circle, lines, dots, or be empty)
  • IRONING: Iron icon (may have dots indicating temperature or X through it)
  • DRY CLEANING: Circle icon (may contain letters P, F, W or X through it)
  • PROFESSIONAL WET CLEANING: Circle with W inside

✓ Fiber content text:
  • "100% Cotton", "80% Polyester 20% Spandex", "Pure Silk"
  • "Shell: 100% Wool | Lining: 100% Polyester"
  • Material composition percentages
  • RN numbers (e.g., "RN 12345")

✓ Written care instructions in any language:
  • "Machine wash cold", "Hand wash only", "Dry clean only"
  • "Do not bleach", "Tumble dry low", "Iron on low heat"
  • Non-English instructions

✓ Country of origin:
  • "Made in China", "Made in Italy", etc.

**PHYSICAL CHARACTERISTICS:**
• Usually white, cream, or light-colored fabric/paper
• Typically rectangular, 1-3 inches wide
• Often sewn into side seams, necklines, or waistbands
• May be folded over or partially tucked in
• Text is usually small, printed in black or dark ink
• Symbols are arranged in a horizontal row (typically 5 symbols)

═══════════════════════════════════════════════════════════════
DETECTION RULES
═══════════════════════════════════════════════════════════════

**Answer YES (detected: true) if:**
• You can see at least ONE care symbol clearly
• You can read ANY fiber content text (even partial like "100% Cot...")
• You see a small rectangular tag with text/symbols, even if blurry or at an angle
• The label is partially folded but symbols or text are still visible
• Multiple labels are visible (size tag + care tag)
• The label is on the inside of a garment but flipped outward and visible

**Answer NO (detected: false) if:**
• The image shows only the outside of a garment with no tag visible
• You see a brand logo or brand name tag, but NO care symbols or fiber content
• The tag is too blurry or dark to make out any symbols or text
• You see a price tag or store tag, but no care label
• The only visible text is a brand name, size, or style number

**EDGE CASES:**
• Size tags often appear with care tags → if EITHER has care symbols, answer YES
• Old/faded labels with barely visible symbols → if you can make out the shape of ANY symbol, answer YES
• Labels at sharp angles or partially folded → if ANY text or symbols are legible, answer YES
• Non-English labels → YES, care symbols are international standard
• Printed labels directly on fabric → YES, these count as care labels

═══════════════════════════════════════════════════════════════
SYMBOL RECOGNITION GUIDE
═══════════════════════════════════════════════════════════════

If you're unsure whether something is a care symbol, here are the five standard shapes:

1. **WASHTUB** — Looks like a trapezoid or bucket shape
2. **TRIANGLE** — Simple triangle
3. **SQUARE** — Square shape, often with a circle inside
4. **IRON** — Old-fashioned iron shape with a flat bottom and handle
5. **CIRCLE** — Simple circle, often with a letter inside

These five symbols appear in sequence on almost every garment care label worldwide.

═══════════════════════════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════════════════════════

Respond with ONLY a JSON object:

{
  "detected": true or false,
  "reason": "brief explanation of what you see or why not detected",
  "confidence": "high" or "medium" or "low"
}

**Examples:**

Good detections:
{"detected": true, "reason": "Five care symbols visible in a row", "confidence": "high"}
{"detected": true, "reason": "Fiber content visible: 100% Cotton", "confidence": "high"}
{"detected": true, "reason": "Partial care label visible at angle, can see washtub and triangle symbols", "confidence": "medium"}
{"detected": true, "reason": "White tag with Made in China and washing instructions", "confidence": "high"}

Correct rejections:
{"detected": false, "reason": "Only brand logo visible, no care symbols or fiber content", "confidence": "high"}
{"detected": false, "reason": "Tag too blurry to read any text or symbols", "confidence": "medium"}
{"detected": false, "reason": "Only showing exterior of garment, no tags visible", "confidence": "high"}

═══════════════════════════════════════════════════════════════

BE GENEROUS: When in doubt, if there's ANY indication of a care label (even partially visible), answer TRUE. It's better to attempt analysis on a marginal label than to miss a valid one.`;
    } else {
      return res.status(400).json({ error: 'Invalid mode. Use "garment" or "label".' });
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
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
