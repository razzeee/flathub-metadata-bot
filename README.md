# Metadata Bot 🤖

Automate metadata generation for Flathub apps using AI and create pull requests to improve app discoverability and quality.

## Features

- 📥 Fetches app metadata from the AppStream catalogue (default: https://dl.flathub.org/repo/appstream/x86_64/appstream.xml.gz) via configurable `APPSTREAM_URL`
- 🤖 Generates metadata using LLM (OpenAI or local Ollama):
  - **Keywords** - Relevant search terms for discoverability
  - **Summaries** - Short, user-friendly descriptions (following Flathub guidelines)
  - **Descriptions** - Detailed app information (following Flathub guidelines)
- 📦 Clones source repositories and finds metadata files
- ✏️ Patches `.desktop` and appstream files (`.metainfo.xml`, `.appdata.xml`)
- 🔄 Creates pull requests on **multiple platforms**:
  - GitHub
  - GitLab (gitlab.com and custom instances like gitlab.gnome.org, invent.kde.org)
  - Codeberg
- 🏠 **Supports local Ollama** - No API costs, full privacy!
- 🔁 **Batch Processing** - Process multiple apps from catalogue with progress tracking and resume capability

## Prerequisites

- [Deno 2.x](https://deno.land/) installed
- **Either:**
  - OpenAI API key, **or**
  - Local [Ollama](https://ollama.ai/) installation
- (Optional) GitHub Personal Access Token for creating PRs
- (Optional) GitLab Personal Access Tokens - **separate token needed for each GitLab instance**:
  - `GITLAB_TOKEN` for gitlab.com
  - `GITLAB_GNOME_TOKEN` for gitlab.gnome.org
  - `GITLAB_KDE_TOKEN` for invent.kde.org
  - `GITLAB_FREEDESKTOP_TOKEN` for gitlab.freedesktop.org
- (Optional) Codeberg Token for creating PRs on Codeberg
- Git installed on your system
  about supported platforms and why separate GitLab tokens are needed.

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
# GitLab tokens - separate token for each instance
GITLAB_TOKEN=glpat-...
GITLAB_GNOME_TOKEN=glpat-...
GITLAB_KDE_TOKEN=...
GITLAB_FREEDESKTOP_TOKEN=glpat-...
CODEBERG_TOKEN=your_codeberg_token_here
```

## Usage

### Single App Mode

Process individual apps with interactive workflow.

#### Interactive Workflow

The bot provides an interactive workflow where you can **accept**, **regenerate**, **skip**, or **quit** after each generated value:

- **(a)ccept** - Accept the generated value and include it in the PR
- **(r)egenerate** - Generate a new value (AI will create a different version)
- **(s)kip** - Skip this metadata type (won't be included in the PR)
- **(q)uit** - Exit the program immediately

This allows you to:

- Run with `--mode all` but skip keywords if you only want summary and description
- Regenerate individual values until you're satisfied
- Create PRs with only the metadata changes you approve

#### Generate All Metadata (default mode)

By default, the bot generates keywords, summary, and description. You'll be prompted after each:

```bash
deno task dev org.mozilla.Firefox
# or explicitly:
deno task dev --mode all org.mozilla.Firefox
```

**Example interaction:**

```
📝 Generating keywords...
✅ Generated 5 keywords:
   1. web browser
   2. firefox
   3. mozilla
   ...
============================================================
Keywords: (a)ccept, (r)egenerate, (s)kip, or (q)uit: a
============================================================

📝 Generating summary...
✅ Generated summary (28 chars):
   "Fast, private web browser"
============================================================
Summary: (a)ccept, (r)egenerate, (s)kip, or (q)uit: s
⏭️  Skipping summary

📝 Generating description...
...
```

#### Generate Keywords Only

```bash
deno task dev --mode keywords org.mozilla.Firefox
```

#### Generate Summary Only

```bash
deno task dev --mode summary org.gimp.GIMP
```

#### Generate Description Only

```bash
deno task dev --mode description org.inkscape.Inkscape
```

#### Modes

- **all** (default) - Generates keywords, summary, AND description
  - You'll be prompted to accept/regenerate/skip each one individually
  - Only accepted values will be included in the final PR
  - Most flexible approach
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

### Batch Processing Mode

Process multiple apps from the appstream catalogue automatically with progress tracking.

#### Basic Batch Processing

Process all desktop and console applications:

```bash
deno task dev --batch
```

#### Skip Apps with Keywords

Only process apps that don't already have keywords:

```bash
deno task dev --batch --skip-with-keywords
```

#### Resume Interrupted Runs

Batch mode automatically tracks progress in `processed_apps.json`. If interrupted, simply run the same command again:

```bash
deno task dev --batch
# Automatically skips already processed apps
```

#### How Batch Mode Works

1. Fetches all apps from the AppStream catalogue
2. Filters to desktop/console applications only
3. Optionally filters out apps with existing keywords (with `--skip-with-keywords`)
4. Processes each app sequentially
5. Tracks progress after each app (safe to interrupt)
6. Continues on errors (logs and skips failed apps)
7. Shows summary at completion

**Progress Tracking:**

- Progress saved to `processed_apps.json` (git-ignored)
- Safe to interrupt at any time
- Automatically resumes from where it left off
- View processed apps count in summary

### Single App Workflow

1. Fetches app data from the AppStream catalogue (default URL: `https://dl.flathub.org/repo/appstream/x86_64/appstream.xml.gz`, configurable via `APPSTREAM_URL`)
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
    ├── appstream-client.ts          # AppStream client (configurable URL)
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
- `GITLAB_TOKEN` (optional) - GitLab.com Personal Access Token with `api` scope
- `GITLAB_GNOME_TOKEN` (optional) - gitlab.gnome.org Personal Access Token with `api` scope
- `GITLAB_KDE_TOKEN` (optional) - invent.kde.org Personal Access Token with `api` scope
- `GITLAB_FREEDESKTOP_TOKEN` (optional) - gitlab.freedesktop.org Personal Access Token with `api` scope
- `CODEBERG_TOKEN` (optional) - Codeberg Token with `repo` scope

**Note**: Each GitLab instance requires its own token because they are separate installations with independent authentication systems.

#### Required Token Scopes

- **GitHub**: `repo` scope is required for:

  - Reading repository metadata
  - Forking repositories
  - Creating pull requests

- **GitLab** (all instances): `api` scope is required for:

  - Reading user information
  - Forking repositories
  - Reading project metadata
  - Creating merge requests

- **Codeberg**: `user:read` and `repository` (read/write) scopes are required for:
  - Reading repository metadata
  - Forking repositories
  - Creating pull requests

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
- **AppStream catalogue** - App metadata source (default URL configurable via `APPSTREAM_URL`)

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

### API Client Architecture

- `src/appstream-client.ts` - Hand-written wrapper with:
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
