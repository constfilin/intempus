import { ElevenLabs } from '@elevenlabs/elevenlabs-js';
import dotenv from 'dotenv';
dotenv.config();

export default {
    // common params
    spreadsheetId                   : (process.env.SPREADSHEETID||'[hidden]'),
    simulatedPhoneNumber            : (process.env.SIMULATED_PHONE_NUMBER || ''),
    googleApiKey                    : (process.env.GOOGLE_API_KEY||'[hidden]'),
    worksheetName                   : (process.env.WORKSHEET_NAME||'Contacts'),
    providerType                    : (process.env.PROVIDER_TYPE||'vapi'),
    vapi                            : (((process.env.PROVIDER_TYPE||'vapi')==='vapi') ? {
        apiKey             : (process.env.VAPI_API_KEY||'[hidden]'),
        toolSecret         : (process.env.VAPI_TOOL_SECRET||process.env.TOOL_SECRET||'[hidden]'),
        model              : (process.env.MODEL || 'gemini-2.5-flash'),
        modelProvider      : (process.env.MODEL_PROVIDER || 'google'),
        orgId              : (process.env.VAPI_ORG_ID||'[hidden]'),
    } : undefined),
    elevenLabs                      : (((process.env.PROVIDER_TYPE||'vapi')==='elevenLabs') ? {
        apiKey             : (process.env.ELEVENLABS_API_KEY||'[hidden]'),
        toolSecret         : (process.env.ELEVENLABS_TOOL_SECRET||process.env.TOOL_SECRET|| '[hidden]'),
        model              : (process.env.MODEL || 'gemini-2.5-flash'),
        workspaceId        : (process.env.ELEVENLABS_WORKSPACE_ID||'[hidden]'),
        summarySecret      : (process.env.ELEVENLABS_SUMMARY_SECRET||'[hidden]'),
        voiceId            : (process.env.ELEVENLABS_VOICE_ID||'XcXEQzuLXRU9RcfWzEJt'),
    } : undefined),
    publicUrl                       : (process.env.PUBLIC_URL||'http://127.0.0.1:9876/api'),                          // https://demo.tectransit.com/api/vapi
    replPort                        : (process.env.REPL_PORT ? parseInt(process.env.REPL_PORT) : 1338),
    notificationEmailAddress        : (process.env.NOTIFICATION_EMAIL_ADDRESS || 'mkhesin@intempus.net'),
    vapeApi : {
        token              : (process.env.VAPE_API_TOKEN||'[hidden]'),
        timeoutSec         : (process.env.VAPE_API_TIMEOUT_SEC ? parseInt(process.env.VAPE_API_TIMEOUT_SEC) : 60),   // timeout for vapeApi calls in seconds
        banPeriodSec       : (process.env.VAPE_API_BAN_PERIOD_SEC ? parseInt(process.env.VAPE_API_BAN_PERIOD_SEC) : 60 * 30),   // ban period for vapeApi calls after timeout in seconds
        requireVerified    : (["true","on", "1"].includes(process.env.VAPE_API_REQUIRE_VERIFIED)), // whether to require verified calls to vapeApi
    },
    // global model defaults for assistants
    // web server
    web                             : {
        path        : __dirname,
        loglevel    : process.env.LOG_LEVEL ? parseInt(process.env.LOG_LEVEL) : 2,           // defines verbosity
        port        : process.env.WEB_PORT ? parseInt(process.env.WEB_PORT) : 9877,          // port to listen on
        // API authentication
        header_name : "x-secret",
    },
    // NodeMailer
    nm                              : {
        from   : "no-reply@intempus.net",
        host   : (process.env.MN_HOST||"smtp-legacy.office365.com"),
        secure : false,
        port   : 587,
        tls    : {
            "ciphers"            : "SSLv3",
            "rejectUnauthorized" : false
        },
        auth   : {
            "user" : (process.env.NM_AUTH_USER||"no-reply@intempus.net"),
            "pass" : (process.env.NM_AUTH_PASS||'')
        }
    },
};
