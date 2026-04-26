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

function sessaoExpirada() {
    const session = JSON.parse(localStorage.getItem('cc_session') || 'null');
    if (!session?.access_token) return true;
    try {
        const payload = JSON.parse(atob(session.access_token.split('.')[1]));
        return payload.exp * 1000 < Date.now();
    } catch(e) { return true; }
}

async function refrescarSessao() {
    const session = JSON.parse(localStorage.getItem('cc_session') || 'null');
    if (!session?.refresh_token) return false;
    try {
        const res = await fetch(SUPA_URL + '/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            headers: { 'apikey': SUPA_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: session.refresh_token })
        });
        if (!res.ok) return false;
        const data = await res.json();
        if (!data.access_token) return false;
        localStorage.setItem('cc_session', JSON.stringify({
            access_token: data.access_token,
            refresh_token: data.refresh_token || session.refresh_token,
            user: data.user || session.user
        }));
        return true;
    } catch(e) { return false; }
}

function expirarSessao() {
    localStorage.removeItem('cc_session');
    localStorage.setItem('cc_msg_login', 'Sua sessão expirou. Faça login novamente.');
    window.location.href = 'login.html';
}

// Verifica expiração ao voltar para a aba — tenta renovar antes de chutar pro login
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && !window.location.href.includes('login.html')) {
        if (sessaoExpirada()) {
            const ok = await refrescarSessao();
            if (!ok) expirarSessao();
        }
    }
});

async function supaFetch(path, options = {}) {
    if (sessaoExpirada()) {
        const ok = await refrescarSessao();
        if (!ok) { expirarSessao(); return; }
    }
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
    if (res.status === 401) {
        const ok = await refrescarSessao();
        if (ok) {
            return supaFetch(path, options);
        }
        expirarSessao();
        return;
    }
    const text = await res.text();
    if (!text) return null;
    const data = JSON.parse(text);
    if (!res.ok) throw new Error(data.message || data.error || JSON.stringify(data));
    return data;
}

async function logApp(origem, mensagem, dados = {}) {
    try {
        const session = JSON.parse(localStorage.getItem('cc_session') || 'null');
        const userEmail = session?.user?.email || null;
        const userNome = session?.user?.user_metadata?.nome || null;
        const payload = { origem, mensagem, dados: { ...dados, user_email: userEmail, user_nome: userNome } };
        await fetch(SUPA_URL + '/rest/v1/logs', {
            method: 'POST',
            headers: {
                'apikey': SUPA_KEY,
                'Authorization': 'Bearer ' + SUPA_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(payload)
        });
    } catch(e) {}
}

// =============================================
// Gemini AI (via Edge Function - chave no servidor)
// =============================================
async function geminiCall(prompt) {
    const res = await fetch(SUPA_URL + '/functions/v1/gemini-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || d.message || `HTTP ${res.status}`);
    return d.text || '';
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
