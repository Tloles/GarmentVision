require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const anthropic = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Supabase client (optional — features degrade gracefully if not configured)
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  console.log('Supabase connected:', process.env.SUPABASE_URL);
} else {
  console.log('Supabase not configured — running without database (add SUPABASE_URL and SUPABASE_SERVICE_KEY to .env)');
}

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
              text: `You are a professional garment care label analyst for a dry cleaning business. Your job is to read care labels and translate them into standardized categories that match the business's processing workflow.

═══════════════════════════════════════════════════════════════
CARE LABEL COMPONENTS
═══════════════════════════════════════════════════════════════

Care labels contain two types of information:

1. **TEXT**: Fiber content, country of origin, brand info, written instructions
2. **SYMBOLS**: Five standardized ISO care symbols in this order:
   [WASH] [BLEACH] [DRY] [IRON] [DRY CLEAN]

Your job is to read BOTH and classify each care instruction into ONE of the predefined standard categories below.

═══════════════════════════════════════════════════════════════
SYMBOL INTERPRETATION GUIDE
═══════════════════════════════════════════════════════════════

**1. WASHING (Washtub/Basin Symbol)**

• Washtub with 30 or one dot → "Machine wash cold"
• Washtub with 40 or two dots → "Machine wash warm"
• Washtub with 60 or three dots → "Machine wash hot"
• Washtub with hand → "Hand wash only"
• Washtub with X → "Do not wash"
• Empty washtub (no temp) → "Machine wash cold" (default to cold for safety)

**2. BLEACHING (Triangle Symbol)**

• Empty triangle OR triangle with lines → "Bleach allowed"
• Triangle with X → "Do not bleach"

**3. DRYING (Square Symbol)**

Square alone:
• Square with three vertical lines → "Line dry / Hang dry"
• Square with one horizontal line → "Dry flat"
• Square with curved line → "Line dry / Hang dry"

Square with circle inside (tumble dry):
• Circle with one dot → "Tumble dry low heat"
• Circle with two dots → "Tumble dry medium heat"
• Circle with three dots → "Tumble dry high heat"
• Circle with X → "Do not tumble dry"

**4. IRONING (Iron Symbol)**

• Iron with any dots → "Iron allowed"
• Iron (no dots) → "Iron allowed"
• Iron with X → "Do not iron"

**5. DRY CLEANING (Circle Symbol)**

• Circle (with or without P, F, W, or underlines) → "Dry clean only"
• Circle with X → "Do not dry clean"
• If text says "Dry clean only" → "Dry clean only"

═══════════════════════════════════════════════════════════════
STANDARDIZED OUTPUT CATEGORIES
═══════════════════════════════════════════════════════════════

You MUST choose EXACTLY ONE option from each list. Do not create custom responses.

**dryClean** — Choose ONE:
• "Dry clean only"
• "Do not dry clean"
• "Not specified"

**washing** — Choose ONE:
• "Do not wash"
• "Hand wash only"
• "Machine wash cold"
• "Machine wash warm"
• "Machine wash hot"
• "Not specified"

**drying** — Choose ONE:
• "Do not tumble dry"
• "Tumble dry low heat"
• "Tumble dry medium heat"
• "Tumble dry high heat"
• "Line dry / Hang dry"
• "Dry flat"
• "Not specified"

**ironing** — Choose ONE:
• "Do not iron"
• "Iron allowed"
• "Not specified"

**bleaching** — Choose ONE:
• "Do not bleach"
• "Bleach allowed"
• "Not specified"

═══════════════════════════════════════════════════════════════
CLASSIFICATION RULES
═══════════════════════════════════════════════════════════════

1. If you see a circle symbol OR text saying "Dry clean only" → dryClean = "Dry clean only"
2. If you see a circle with X → dryClean = "Do not dry clean"
3. If no circle symbol and no dry clean text → dryClean = "Not specified"
4. When temperature is ambiguous, default to the SAFEST option (cold wash, low heat dry)
5. If a symbol is unclear or not visible → use "Not specified" for that category
6. When text and symbols conflict, trust the SYMBOLS (international standard)

═══════════════════════════════════════════════════════════════
FIBER CONTENT EXTRACTION
═══════════════════════════════════════════════════════════════

Copy the EXACT fiber content text as written:
• "100% Cotton"
• "65% Polyester, 35% Cotton"
• "Shell: 100% Wool / Lining: 100% Polyester"

If no fiber content is visible, return "Not specified"

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

Return ONLY valid JSON using the exact category names:

{
  "fiberContent": "exact text from label or 'Not specified'",
  "dryClean": "one of the three dryClean options",
  "washing": "one of the six washing options",
  "drying": "one of the seven drying options",
  "ironing": "one of the three ironing options",
  "bleaching": "one of the three bleaching options"
}

**Correct examples:**

Silk dress shirt with dry clean symbol:
{
  "fiberContent": "100% Silk",
  "dryClean": "Dry clean only",
  "washing": "Do not wash",
  "drying": "Do not tumble dry",
  "ironing": "Iron allowed",
  "bleaching": "Do not bleach"
}

Cotton t-shirt label:
{
  "fiberContent": "100% Cotton",
  "dryClean": "Not specified",
  "washing": "Machine wash warm",
  "drying": "Tumble dry medium heat",
  "ironing": "Iron allowed",
  "bleaching": "Bleach allowed"
}

Wool sweater:
{
  "fiberContent": "100% Merino Wool",
  "dryClean": "Dry clean only",
  "washing": "Hand wash only",
  "drying": "Dry flat",
  "ironing": "Do not iron",
  "bleaching": "Do not bleach"
}

═══════════════════════════════════════════════════════════════

CRITICAL: You must select from the predefined categories ONLY. Do not create variations or custom text. If unsure, use "Not specified".`,
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

// Orphan garment visual matching endpoint
app.post('/api/orphan/match', async (req, res) => {
  try {
    const { orphanPhoto, candidates } = req.body;
    if (!orphanPhoto || !candidates || candidates.length === 0) {
      return res.status(400).json({ error: 'Missing orphan photo or candidates' });
    }

    const content = [
      { type: 'text', text: 'ORPHAN GARMENT (identify this one):' },
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: orphanPhoto },
      },
    ];

    candidates.forEach((candidate, index) => {
      content.push({
        type: 'text',
        text: `CANDIDATE ${index + 1} - ID: ${candidate.barcode}, Order: #${candidate.orderNumber}:`,
      });
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: candidate.photo },
      });
    });

    content.push({
      type: 'text',
      text: `You are helping identify an orphaned garment that lost its barcode during cleaning.

I showed you:
1. A photo of the ORPHAN garment (the one we need to identify)
2. Photos of ${candidates.length} CANDIDATE garments from recent check-ins

Your job: Determine which candidate garment is the SAME physical item as the orphan.

MATCHING CRITERIA (look for these distinguishing features):

**Buttons:**
- Number of buttons
- Button material (plastic, metal, horn)
- Button color and size
- Button placement and spacing

**Pockets:**
- Number and placement
- Style (patch, flap, welt, no pockets)
- Pocket button details

**Construction details:**
- Stitching patterns (topstitching, contrast stitching)
- Seam placement
- Collar or lapel style
- Cuff style

**Fabric characteristics:**
- Texture (smooth, textured, ribbed)
- Pattern (solid, pinstripe, plaid, herringbone)
- Sheen or finish

**Wear patterns or unique marks:**
- Fading or discoloration
- Wear on cuffs or collar
- Any unique marks, stains, or repairs visible in original photo

**Brand labels or logos:**
- Visible brand labels
- Embroidered logos or monograms

IMPORTANT NOTES:
- The orphan was just cleaned, so it may look slightly different (cleaner, pressed)
- Focus on STRUCTURAL features that don't change with cleaning (buttons, pockets, construction)
- Ignore minor differences in how the garment is positioned in the photo
- Color may appear slightly different due to lighting, but structure should match exactly

Return ONLY valid JSON:

{
  "matches": [
    {
      "candidateId": "barcode from candidate label above",
      "confidence": 0.0 to 1.0,
      "matchingFeatures": ["list of specific features that match"],
      "differences": ["any notable differences observed, if any"]
    }
  ],
  "topMatchReasoning": "brief explanation of why the top match is most likely correct"
}

Rank all candidates by confidence. If no candidates are strong matches (all confidence < 0.6), the highest confidence should still be first but note the low confidence.`,
    });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content }],
    });

    const text = message.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      res.json(JSON.parse(jsonMatch[0]));
    } else {
      res.status(500).json({ error: 'Could not parse matching response' });
    }
  } catch (err) {
    console.error('Orphan matching error:', err.status, err.message);
    if (err.error) console.error('Details:', JSON.stringify(err.error));
    const detail = err.status === 401 ? 'Invalid API key' :
                   err.status === 429 ? 'Rate limited — slow down' :
                   err.message || 'Unknown error';
    res.status(500).json({ error: `Orphan matching failed: ${detail}` });
  }
});

// ---- CUSTOMER ENDPOINTS ----

// Get next customer barcode
app.get('/api/customer/next-barcode', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { data } = await supabase
      .from('customers')
      .select('customer_barcode')
      .order('customer_barcode', { ascending: false })
      .limit(1);
    let nextNum = 1;
    if (data && data.length > 0) {
      const num = parseInt(data[0].customer_barcode.replace('CUST-', ''));
      if (!isNaN(num)) nextNum = num + 1;
    }
    res.json({ barcode: 'CUST-' + String(nextNum).padStart(5, '0') });
  } catch (err) {
    console.error('Next customer barcode error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Look up customer by barcode
app.get('/api/customer/:barcode', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database not configured', found: false });
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('customer_barcode', req.params.barcode)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message, found: false });
    if (!data) return res.json({ found: false });
    res.json({ found: true, customer: data });
  } catch (err) {
    console.error('Customer lookup error:', err.message);
    res.status(500).json({ error: err.message, found: false });
  }
});

// Create customer
app.post('/api/customer', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { customer_barcode, name, phone, email } = req.body;
    if (!customer_barcode || !name) {
      return res.status(400).json({ error: 'Barcode and name are required' });
    }

    // Use upsert to handle duplicate barcodes gracefully
    const { data, error } = await supabase
      .from('customers')
      .upsert(
        { customer_barcode, name, phone: phone || null, email: email || null },
        { onConflict: 'customer_barcode' }
      )
      .select()
      .single();

    if (error) {
      console.error('Customer upsert error:', error.message);
      // Fallback: try to fetch the existing customer
      const { data: existing } = await supabase
        .from('customers')
        .select('*')
        .eq('customer_barcode', customer_barcode)
        .maybeSingle();
      if (existing) {
        return res.json({ success: true, customer: existing });
      }
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, customer: data });
  } catch (err) {
    console.error('Create customer error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---- ORDER ENDPOINTS ----

// Create order
app.post('/api/order', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { customer_barcode } = req.body;
    // Generate order number: ORD-YYYYMMDD-XXX
    const now = new Date();
    const dateStr = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');
    const prefix = 'ORD-' + dateStr + '-';

    // Get today's order count for sequencing
    let seq = 1;
    try {
      const { data: todayOrders } = await supabase
        .from('orders')
        .select('order_number')
        .like('order_number', prefix + '%');
      seq = (todayOrders ? todayOrders.length : 0) + 1;
    } catch (countErr) {
      console.error('Order count query failed, using seq=1:', countErr.message);
    }
    const orderNumber = prefix + String(seq).padStart(3, '0');

    // Build insert payload — only include columns that exist
    const insertPayload = { customer_barcode: customer_barcode || null };

    // Try with order_number and status first (full schema)
    let result = await supabase
      .from('orders')
      .insert({ ...insertPayload, order_number: orderNumber, status: 'open' })
      .select()
      .single();

    // If columns don't exist, retry with minimal payload
    if (result.error && result.error.message && result.error.message.includes('column')) {
      console.error('Full insert failed, retrying minimal:', result.error.message);
      result = await supabase
        .from('orders')
        .insert(insertPayload)
        .select()
        .single();
    }

    if (result.error) {
      console.error('Order insert error:', result.error.message);
      return res.status(500).json({ error: 'Failed to create order: ' + result.error.message });
    }

    // Ensure the order object has an order_number for the frontend
    const order = result.data;
    if (!order.order_number) order.order_number = orderNumber;

    res.json({ success: true, order });
  } catch (err) {
    console.error('Create order error:', err.message);
    res.status(500).json({ error: 'Create order failed: ' + err.message });
  }
});

// Get order with items
app.get('/api/order/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (orderErr) return res.status(500).json({ error: orderErr.message });

    const { data: items, error: itemsErr } = await supabase
      .from('order_items')
      .select('*, garments(*)')
      .eq('order_id', req.params.id);
    if (itemsErr) return res.status(500).json({ error: itemsErr.message });

    res.json({ order, items: items || [] });
  } catch (err) {
    console.error('Get order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Add item to order
app.post('/api/order/:id/items', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { garment_barcode } = req.body;
    if (!garment_barcode) return res.status(400).json({ error: 'garment_barcode required' });

    // Look up garment id
    const { data: garment } = await supabase
      .from('garments')
      .select('id')
      .eq('barcode', garment_barcode)
      .maybeSingle();

    const { data, error } = await supabase
      .from('order_items')
      .insert({
        order_id: parseInt(req.params.id),
        garment_barcode,
        garment_id: garment ? garment.id : null,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, item: data });
  } catch (err) {
    console.error('Add order item error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Remove item from order
app.delete('/api/order/:id/items/:barcode', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { error } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', parseInt(req.params.id))
      .eq('garment_barcode', req.params.barcode);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    console.error('Remove order item error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Complete order
app.patch('/api/order/:id/complete', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { data, error } = await supabase
      .from('orders')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', parseInt(req.params.id))
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, order: data });
  } catch (err) {
    console.error('Complete order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---- GARMENT ENDPOINTS ----

// Get next garment barcode (must be before /api/garment/:barcode)
app.get('/api/garment/next-barcode', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { data } = await supabase
      .from('garments')
      .select('barcode')
      .like('barcode', 'GARM-%')
      .order('barcode', { ascending: false })
      .limit(1);
    let nextNum = 1;
    if (data && data.length > 0) {
      const num = parseInt(data[0].barcode.replace('GARM-', ''));
      if (!isNaN(num)) nextNum = num + 1;
    }
    res.json({ barcode: 'GARM-' + String(nextNum).padStart(5, '0') });
  } catch (err) {
    console.error('Next garment barcode error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---- SUPABASE ENDPOINTS ----

// Barcode lookup — check if garment exists in database
app.get('/api/garment/:barcode', async (req, res) => {
  const { barcode } = req.params;
  if (!barcode) {
    return res.status(400).json({ error: 'No barcode provided' });
  }

  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured', found: false });
  }

  try {
    const { data, error } = await supabase
      .from('garments')
      .select('*')
      .eq('barcode', barcode)
      .maybeSingle();

    if (error) {
      console.error('Barcode lookup error:', error.message);
      return res.status(500).json({ error: 'Database query failed: ' + error.message, found: false });
    }

    if (!data) {
      return res.json({ found: false });
    }

    res.json({ found: true, garment: data });
  } catch (err) {
    console.error('Barcode lookup error:', err.message);
    res.status(500).json({ error: 'Barcode lookup failed: ' + err.message, found: false });
  }
});

// Save garment to database with photo upload
app.post('/api/garment/save', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const {
      barcode, garmentType, color, brand, fiberContent,
      careDryClean, careWashing, careDrying, careIroning, careBleaching,
      damageNotes, photos,
    } = req.body;

    if (!barcode) {
      return res.status(400).json({ error: 'No barcode provided' });
    }

    // Upload photos to storage bucket
    let photoFrontUrl = null;
    let photoLabelUrl = null;

    if (photos) {
      if (photos.front) {
        try {
          const frontBuffer = Buffer.from(photos.front, 'base64');
          const frontPath = `${barcode}/front.jpg`;
          const { error: uploadErr } = await supabase.storage
            .from('garment-photos')
            .upload(frontPath, frontBuffer, {
              contentType: 'image/jpeg',
              upsert: true,
            });

          if (uploadErr) {
            console.error('Front photo upload error:', uploadErr.message);
          } else {
            const { data: urlData } = supabase.storage
              .from('garment-photos')
              .getPublicUrl(frontPath);
            photoFrontUrl = urlData.publicUrl;
          }
        } catch (photoErr) {
          console.error('Front photo upload failed:', photoErr.message);
        }
      }

      if (photos.label) {
        try {
          const labelBuffer = Buffer.from(photos.label, 'base64');
          const labelPath = `${barcode}/label.jpg`;
          const { error: uploadErr } = await supabase.storage
            .from('garment-photos')
            .upload(labelPath, labelBuffer, {
              contentType: 'image/jpeg',
              upsert: true,
            });

          if (uploadErr) {
            console.error('Label photo upload error:', uploadErr.message);
          } else {
            const { data: urlData } = supabase.storage
              .from('garment-photos')
              .getPublicUrl(labelPath);
            photoLabelUrl = urlData.publicUrl;
          }
        } catch (photoErr) {
          console.error('Label photo upload failed:', photoErr.message);
        }
      }
    }

    // Upsert garment record
    const garmentRecord = {
      barcode,
      garment_type: garmentType || null,
      color: color || null,
      brand: brand || null,
      fiber_content: fiberContent || null,
      care_dry_clean: careDryClean || null,
      care_washing: careWashing || null,
      care_drying: careDrying || null,
      care_ironing: careIroning || null,
      care_bleaching: careBleaching || null,
      damage_notes: damageNotes || null,
      photo_front_url: photoFrontUrl,
      photo_label_url: photoLabelUrl,
      last_checked_in: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('garments')
      .upsert(garmentRecord, { onConflict: 'barcode' })
      .select()
      .single();

    if (error) {
      console.error('Garment save error:', error.message);
      return res.status(500).json({ error: 'Failed to save garment: ' + error.message });
    }

    res.json({ success: true, garment: data, photosMissing: !photoFrontUrl && photos?.front ? true : false });
  } catch (err) {
    console.error('Garment save error:', err.message);
    res.status(500).json({ error: 'Garment save failed: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Garment Intake Server running at http://localhost:${PORT}`);
});
