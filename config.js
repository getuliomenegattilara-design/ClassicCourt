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
