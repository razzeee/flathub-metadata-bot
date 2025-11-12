# Flathub Quality Guidelines Integration

This document explains how the Metadata Bot implements Flathub's quality guidelines for metadata generation.

## Official Guidelines Reference

The implementation is based on:
https://docs.flathub.org/docs/for-app-authors/metainfo-guidelines/quality-guidelines

## Summary Generation

### Guidelines Implemented

1. **Length Requirements**
   - Ideal: 10-25 characters
   - Maximum: 35 characters
   - Warning displayed if exceeds 35 characters

2. **Formatting Rules**
   - Sentence case (not Title Case)
   - No ending period (automatically removed)
   - No starting articles (a, an, the)
   - No app name repetition

3. **Content Rules**
   - Non-technical language
   - No toolkit/language mentions (GTK, Qt, Rust, etc.)
   - No "app", "tool", or "client" mentions
   - Use imperative verbs ("Edit photos" not "Photo editing")
   - Understandable to non-technical users

### AI Prompt Strategy

The system prompt includes:
- Explicit character limits
- Good and bad examples from Flathub docs
- Focus on user actions (what users DO with the app)
- Emphasis on non-technical language

### Examples

**Good Summaries:**
- "Write markdown in style"
- "View images and videos"
- "Edit documents"
- "Browse the web privately"

**Bad Summaries (Avoided):**
- "A Simple Markdown Editor." ❌ (has article, ends with period)
- "GTK4 chat app" ❌ (technical, mentions toolkit)
- "The best editor" ❌ (starts with article)
- "Apostrophe - Editor" ❌ (has punctuation)

## Description Generation

### Guidelines Implemented

1. **Length Requirements**
   - Target: 3-6 lines (~210-420 characters)
   - Not too short (more than just summary)
   - Not too long (avoid overwhelming users)

2. **Content Structure**
   - Don't repeat or rephrase the summary
   - Focus on app purpose, features, and uniqueness
   - Use paragraphs instead of endless bullet points
   - Maximum 10 items if using lists

3. **Content Quality**
   - Provide useful information
   - Target both technical and non-technical users
   - Make it scannable and easy to read

### AI Prompt Strategy

The system prompt includes:
- Target length in characters
- Structure guidance (paragraphs over lists)
- Emphasis on not repeating summary
- Focus on purpose, features, and uniqueness
- Good and bad examples

### Output Format

The generated description is automatically formatted into paragraphs:
```xml
<description>
  <p>
    First paragraph about what the app does and why it's useful.
  </p>
  <p>
    Second paragraph about key features or unique aspects.
  </p>
</description>
```

## Keywords Generation

### Guidelines Implemented

1. **Quantity**
   - Target: 5 keywords
   - Maximum: 8 keywords
   - Hard limit enforced in code

2. **Quality Focus**
   - SEO-optimized for search
   - High-volume search terms
   - Specific functionality keywords
   - Important synonyms only
   - Use-case keywords

3. **Format**
   - Lowercase
   - No special characters
   - 1-3 words for better matching
   - Avoid duplicating categories

### AI Prompt Strategy

The system prompt includes:
- "Quality over quantity" emphasis
- SEO focus (what users search for)
- Problem-solving keywords
- Alternative app names
- Technical and non-technical terms
- Context from similar apps and categories

### Integration with Flathub API

The keyword generator also:
1. Fetches similar apps for context
2. Gets available Flathub categories to avoid duplication
3. Considers existing keywords in the app metadata

## File Patching Strategy

### Desktop Files (.desktop)
- **Keywords**: ✅ Patched
- **Summary**: ❌ Not patched (with warning)
- **Description**: ❌ Not patched (with warning)

Desktop files only support the `Keywords=` field for desktop environment search.

### Appstream Files (.metainfo.xml, .appdata.xml)
- **Keywords**: ✅ Patched in `<keywords>` section
- **Summary**: ✅ Patched in `<summary>` tag
- **Description**: ✅ Patched in `<description>` section

Appstream files support full metadata for app stores like Flathub.

### XML Structure

**Keywords:**
```xml
<keywords>
  <keyword>web browser</keyword>
  <keyword>internet</keyword>
  <keyword>privacy</keyword>
</keywords>
```

**Summary:**
```xml
<summary>Browse the web privately</summary>
```

**Description:**
```xml
<description>
  <p>
    Firefox is a fast, private web browser that puts your privacy first.
  </p>
  <p>
    It includes built-in tracking protection, customizable interface, and
    supports modern web standards.
  </p>
</description>
```

## Benefits of Following Guidelines

According to Flathub documentation:
1. Enhanced visibility on Flathub homepage
2. Featured in weekly banner and "App of the Day"
3. Higher chances in trending section
4. Better curation by Linux distributions
5. Improved user experience and discoverability

## Validation

The bot includes:
- Character count warnings for summaries
- Automatic period removal
- XML escaping for special characters
- Format validation for keywords
- File type checking (desktop vs appstream)

## Future Improvements

Potential enhancements:
1. Validate summary doesn't start with articles
2. Check for technical terms in summaries
3. Suggest improvements for existing metadata
4. Multi-language support
5. Screenshot caption generation
6. Release notes generation
