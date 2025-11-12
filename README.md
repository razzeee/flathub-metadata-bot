# Metadata Bot 🤖

Automate metadata generation for Flathub apps using AI and create pull requests to improve app discoverability and quality.

## Features

- 📥 Fetches app metadata from Flathub API v2
- 🤖 Generates metadata using LLM (OpenAI or local Ollama):
  - **Keywords** - Relevant search terms for discoverability
  - **Summaries** - Short, user-friendly descriptions (following Flathub guidelines)
  - **Descriptions** - Detailed app information (following Flathub guidelines)
- 📦 Clones source repositories and finds metadata files
- ✏️ Patches `.desktop` and appstream files (`.metainfo.xml`, `.appdata.xml`)
- 🔄 Creates pull requests on GitHub and GitLab automatically
- 🏠 **Supports local Ollama** - No API costs, full privacy!

## Prerequisites

- [Deno 2.x](https://deno.land/) installed
- **Either:**
  - OpenAI API key, **or**
  - Local [Ollama](https://ollama.ai/) installation
- (Optional) GitHub Personal Access Token for creating PRs
- (Optional) GitLab Personal Access Token for creating MRs
- Git installed on your system

## Installation

1. Clone this repository (or you're already in it!)

2. Copy the example environment file:
```bash
cp .env.example .env
```

3. Edit `.env` and add your API keys:
```env
OPENAI_API_KEY=sk-...
GITHUB_TOKEN=ghp_...
GITLAB_TOKEN=glpat-...
```

## Usage

### Generate All Metadata (default mode)

By default, the bot generates keywords, summary, and description all in one PR:

```bash
deno task dev org.mozilla.Firefox
# or explicitly:
deno task dev --mode all org.mozilla.Firefox
```

### Generate Keywords Only

```bash
deno task dev --mode keywords org.mozilla.Firefox
```

### Generate Summary Only

```bash
deno task dev --mode summary org.gimp.GIMP
```

### Generate Description Only

```bash
deno task dev --mode description org.inkscape.Inkscape
```

### Modes

- **all** (default) - Generates keywords, summary, AND description in a single PR
  - Most efficient way to improve app metadata
  - All changes combined into one pull request
- **keywords** - Generates 5-8 SEO-optimized keywords for search discoverability
  - Added to both `.desktop` and appstream XML files
- **summary** - Generates a concise summary following Flathub quality guidelines
  - 10-25 characters ideal (max 35)
  - Sentence case, imperative verbs, no articles
  - Added to appstream XML files only
- **description** - Generates a detailed description following Flathub quality guidelines
  - 3-6 lines (~210-420 characters)
  - Informative but scannable
  - Added to appstream XML files only

### What it does:

1. Fetches app data from `https://flathub.org/api/v2/appstream/{app_id}`
2. Uses AI to generate the requested metadata based on the app's existing information
   - In **all** mode: Generates keywords, summary, and description sequentially
   - In specific modes: Generates only the requested metadata type
3. Clones the app's source repository
4. Finds `.desktop` or `.metainfo.xml` / `.appdata.xml` files
5. Patches the files with generated metadata
6. Creates a new branch and commits changes
7. Creates a pull request (if tokens are configured)

## Project Structure

```
metadata-bot/
├── main.ts                      # Entry point
├── deno.json                    # Deno configuration
├── .env.example                 # Environment template
├── .gitignore
├── README.md
├── .github/
│   └── copilot-instructions.md  # Project instructions
└── src/
    ├── flathub-api.ts          # Flathub API client
    ├── metadata-generator.ts     # LangChain + LLM integration (keywords, summaries, descriptions)
    ├── repository-manager.ts    # Git operations
    ├── file-patcher.ts         # Metadata file patching
    └── pr-manager.ts           # GitHub/GitLab PR creation
```

## Configuration

### Environment Variables

- `LLM_PROVIDER` (optional) - LLM provider to use: `openai` or `ollama` (default: `ollama`)
- `OPENAI_API_KEY` (required for OpenAI) - Your OpenAI API key
- `LLM_MODEL` (optional) - Model name to use
  - OpenAI: `gpt-4o-mini` (default), `gpt-4o`, `gpt-3.5-turbo`, etc.
  - Ollama: `llama3.2:1b` (default), `llama3.2`, `mistral`, `qwen2.5`, etc.
- `OLLAMA_BASE_URL` (optional) - Ollama server URL (default: `http://localhost:11435`)
- `GITHUB_TOKEN` (optional) - GitHub Personal Access Token with `repo` scope
- `GITLAB_TOKEN` (optional) - GitLab Personal Access Token with `api` scope

### Using Local Ollama

To use a local Ollama instance instead of OpenAI:

**Option 1: Using Alpaca (GUI, recommended for beginners)**

1. Install Alpaca from Flathub:
```bash
flatpak install flathub com.jeffser.Alpaca
```

2. Launch Alpaca and install models through the UI

3. Go to **Manage Instances** → Edit the **Ollama** instance

4. Enable **"Expose Ollama to Network"**

5. Configure your `.env`:
```env
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2:1b
OLLAMA_BASE_URL=http://localhost:11435
```

6. Run the bot:
```bash
deno task dev org.mozilla.Firefox
```

**Option 2: Using Ollama CLI**

1. Install and start Ollama: https://ollama.ai/

2. Pull a model:
```bash
ollama pull llama3.1
```

3. Configure your `.env`:
```env
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2:1b
OLLAMA_BASE_URL=http://localhost:11435
```

4. Run the bot:
```bash
deno task dev org.mozilla.Firefox
```

### Using OpenAI
1. Go to https://platform.openai.com/api-keys
2. Create a new API key

**GitHub:**
1. Go to Settings → Developer settings → Personal access tokens
2. Generate new token with `repo` scope

**GitLab:**
1. Go to Preferences → Access Tokens
2. Create token with `api` scope

## Examples

Process a single app:
```bash
deno task dev org.blender.Blender
```

Without PR creation (no tokens needed):
```bash
# Bot will clone, patch files, and create a local branch
# You can manually push and create PR
deno task dev org.inkscape.Inkscape
```

## File Format Support

### Desktop Files (.desktop)
Adds or updates the `Keywords` line:
```desktop
[Desktop Entry]
Name=MyApp
Keywords=keyword1;keyword2;keyword3;
```

### AppStream Metainfo/Appdata XML
Adds or updates the `<keywords>` section:
```xml
<component>
  ...
  <keywords>
    <keyword>keyword1</keyword>
    <keyword>keyword2</keyword>
    <keyword>keyword3</keyword>
  </keywords>
</component>
```

## Troubleshooting

**Error: "OPENAI_API_KEY not set"**
- Make sure you've created a `.env` file and added your OpenAI API key

**Error: "Failed to clone repository"**
- Ensure Git is installed and accessible
- Check if the repository URL is valid
- Private repositories may require authentication

**Error: "Failed to create GitHub PR"**
- Verify your GitHub token has the `repo` scope
- Ensure you have write access to the repository
- Check if a branch with the same name already exists

## Development

The project uses:
- **Deno 2.x** - Modern JavaScript/TypeScript runtime
- **LangChain** - LLM orchestration framework
- **OpenAI API / Ollama** - LLM models for metadata generation
- **Flathub API v2** - App metadata source
- **Orval** - TypeScript client generator for OpenAPI specs

### Quality Assurance

The project includes a comprehensive quality pipeline with formatting, linting, type checking, and tests:

```bash
# Format code (auto-fix)
deno task fmt

# Check formatting (CI mode)
deno task fmt:check

# Run linter
deno task lint

# Run type checker
deno task check

# Run all tests
deno task test

# Run tests in watch mode
deno task test:watch

# Run tests with coverage
deno task test:coverage
deno task coverage

# Run all quality checks at once
deno task quality
```

The quality pipeline runs automatically on all pull requests via GitHub Actions (see `.github/workflows/quality.yml`).

#### Writing Tests

Tests are located in the `tests/` directory and use Deno's built-in testing framework:

```typescript
import { assertEquals, assertExists } from "@std/assert";

Deno.test("my test", () => {
  assertEquals(1 + 1, 2);
});
```

See `tests/README.md` for more details on writing and running tests.

### Regenerating the API Client

The Flathub API client is generated from the OpenAPI specification using Orval. If the Flathub API changes, regenerate the client:

```bash
deno task generate
```

This will:
1. Fetch the latest OpenAPI spec from `https://flathub.org/api/v2/openapi.json`
2. Generate TypeScript types and functions in `src/generated/flathub-api.ts`
3. The wrapper in `src/flathub-api.ts` provides convenience methods and type guards

### API Client Architecture

- `src/generated/flathub-api.ts` - Auto-generated Orval client (do not edit manually)
- `src/flathub-api.ts` - Hand-written wrapper with:
  - Simplified type exports (`AppstreamData`, `SummaryData`, `SearchResult`)
  - Helper functions (`getDescription()`, `getKeywords()`) for union type safety
  - Convenience methods with error handling
  - Repository URL parsing logic

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## License

MIT

## Disclaimer

This bot creates automated pull requests. Please:
- Review generated keywords before merging
- Respect repository contribution guidelines
- Use appropriate rate limiting
- Test on your own repositories first
