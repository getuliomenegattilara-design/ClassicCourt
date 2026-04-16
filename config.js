// =============================================
// Configuracao Supabase - ClassicCourt
// =============================================
const SUPA_URL = 'https://mhewnnjlaqcwhjjqjdyr.supabase.co';
const SUPA_KEY = 'sb_publishable_DKdzEzoer4yaztQ-lF2oSw_Ut_MtVno';

function getToken() {
    const session = JSON.parse(localStorage.getItem('cc_session') || 'null');
    return session?.access_token || SUPA_KEY;
}

function getUserId() {
    const session = JSON.parse(localStorage.getItem('cc_session') || 'null');
    return session?.user?.id || null;
}

async function supaFetch(path, options = {}) {
    const res = await fetch(SUPA_URL + '/rest/v1/' + path, {
        ...options,
        headers: {
            'apikey': SUPA_KEY,
            'Authorization': 'Bearer ' + getToken(),
            'Content-Type': 'application/json',
            'Prefer': options.prefer || '',
            ...(options.headers || {})
        }
    });
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
}

async function logApp(origem, mensagem, dados = {}) {
    try {
        await fetch(SUPA_URL + '/rest/v1/logs', {
            method: 'POST',
            headers: {
                'apikey': SUPA_KEY,
                'Authorization': 'Bearer ' + SUPA_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ origem, mensagem, dados })
        });
    } catch(e) {}
}

// =============================================
// Gemini AI (via Edge Function - chave no servidor)
// =============================================
async function geminiCall(prompt) {
    try {
        const res = await fetch(SUPA_URL + '/functions/v1/gemini-proxy', {
            method: 'POST',
            headers: { 'apikey': SUPA_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        const d = await res.json();
        return d.text || '';
    } catch(e) { return ''; }
}

async function supaCount(path) {
    const res = await fetch(SUPA_URL + '/rest/v1/' + path, {
        headers: {
            'apikey': SUPA_KEY,
            'Authorization': 'Bearer ' + getToken(),
            'Prefer': 'count=exact',
            'Range': '0-0'
        }
    });
    const range = res.headers.get('content-range');
    return range ? parseInt(range.split('/')[1]) : 0;
}
