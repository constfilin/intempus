## INSTALLATION
1. Install Node.js
2. Clone the repository
3. `cd [this repo]`
4. `npm install`

## RUNNING
- Start the web server: `npm start`
- This runs `npx tsx web.ts` and exposes the Express API under `/api`

### CLI usage
- Run commands directly: `npx tsx cmd.ts --cmd=<command> [--id=<id>] [--name=<name>] [--sessionId=<sessionId>] [--phoneNumber=<phoneNumber>] [--question=<question>] [--limit=<n>] [--stringify]`
- If `--stringify` is provided, output is JSON-stringified.

### Supported CLI commands
- `listContacts` — list contacts from the configured Google spreadsheet
- `getUserByPhone` — call Vape API for a user by phone using `--sessionId` and `--phoneNumber`
- `getFAQAnswer` — call Vape API FAQ answer using `--sessionId` and `--question`
- `listPhoneNumbers` — list phone numbers via the configured VAPI API
- `deletePhoneNumber` — delete a phone number via VAPI with `--id`
- `getToolById` — retrieve a tool by `--id`
- `getTool` / `getToolByName` — retrieve a tool by `--name`
- `listTools` — list tools in the configured provider org
- `getAgentById` — retrieve an agent by `--id`
- `getAgent` / `getAgentByName` — retrieve an agent by `--name`
- `listAgents` — list agents in the configured provider org
- `credateTool` — create or update a tool by `--name`
- `credateAgent` — create or update an agent by `--name`
- `credateTools` — create or update all configured tools
- `credateAgents` — create or update all configured agents
- `credateAll` — create or update all configured agents and tools

## API ENDPOINTS
The web server exposes the following endpoints under `/api`.

### Tool endpoints
- `POST /api/tool/sendEmail`
- `POST /api/tool/dispatchCall`
- `POST /api/tool/guessState`
- `POST /api/tool/getUserByPhone`
- `POST /api/tool/dispatchUserByPhone`
- `POST /api/tool/getFAQAnswer`

### Call lifecycle endpoints
- `POST /api/pre-call`
- `POST /api/post-call`

### Generic command endpoint
- `POST /api/cmd`
  - Request body should include `{ cmd: ..., ... }`

> All secured endpoints require the request header `x-secret` to match the configured provider tool secret.

## CONFIGURATION
The project uses `config.js` and environment variables for configuration.

### Required variables
- `SPREADSHEETID` — Google spreadsheet ID for contacts
- `GOOGLE_API_KEY` — API key to read the Google spreadsheet
- `PROVIDER_TYPE` — `vapi` or `elevenLabs`

### VAPI provider variables
- `VAPI_API_KEY`
- `VAPI_TOOL_SECRET` or `TOOL_SECRET`
- `VAPI_ORG_ID`
- `MODEL` (defaults to `gemini-2.5-flash`)
- `MODEL_PROVIDER` (defaults to `google`)

### ElevenLabs provider variables
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_TOOL_SECRET` or `TOOL_SECRET`
- `ELEVENLABS_WORKSPACE_ID`
- `ELEVENLABS_SUMMARY_SECRET`
- `ELEVENLABS_VOICE_ID`

### Other environment variables
- `SIMULATED_PHONE_NUMBER`
- `WORKSHEET_NAME` (default `Contacts`)
- `VAPE_API_TOKEN`
- `PUBLIC_URL` (default `http://127.0.0.1:9876/api`)
- `REPL_PORT` (default `1338`)
- `WEB_PORT` (default `9877`)
- `LOG_LEVEL` (default `2`)
- `VAPE_API_TOKEN` (no default)
- `VAPE_API_TIMEOUT_SEC` (default `60`)
- `VAPE_API_BAN_PERIOD_SEC` (default `1800`)
- `VAPI_API_REQUIRE_VERIFIED` (default `false`)
- `NOTIFICATION_EMAIL_ADDRESS`
- `NM_AUTH_USER`
- `NM_AUTH_PASS`

## NOTES
- The web server uses `express.urlencoded()` and custom JSON parsing in some API handlers.
- The `Server` class also starts a local REPL on `localhost:<REPL_PORT>`.
- Tool and agent registration commands are implemented as `credate*` commands.
