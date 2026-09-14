/* Shared student-session client. Contractor codes are used only for POST login. */
(function () {
    'use strict';
    var nativeFetch = window.fetch.bind(window);
    var generation = 0;
    var pending = new Set();
    var key = 'wr_student_session';
    ['workready_code', 'workready_email', 'seekjobs_code', 'seekjobs_email'].forEach(function (k) {
        localStorage.removeItem(k);
    });
    function base() {
        return (window.WORKREADY_CONFIG || window.SEEK_CONFIG || {}).API_BASE ||
            'https://workready-api.eduserver.au';
    }
    function stale() { return new DOMException('Session changed', 'AbortError'); }
    function invalidate() {
        generation += 1;
        pending.forEach(function (controller) { controller.abort(); });
        pending.clear();
        sessionStorage.removeItem(key);
    }
    function cleanURL(input) {
        var url = new URL(input, base());
        url.pathname = url.pathname.replace(/\/api\/v1\/student\/[^/]+\/state$/, '/api/v1/me/state')
            .replace(/\/api\/v1\/student\/[^/]+\/profile$/, '/api/v1/me/profile')
            .replace(/\/api\/v1\/mail\/sent\/[^/]+$/, '/api/v1/mail/sent')
            .replace(/\/api\/v1\/inbox\/[^/]+$/, '/api/v1/inbox');
        ['code', 'student_code', 'student_email'].forEach(function (k) { url.searchParams.delete(k); });
        return url;
    }
    function authenticatedFetch(input, options) {
        var url = cleanURL(input);
        if (url.origin !== new URL(base()).origin) return nativeFetch(input, options);
        if (url.pathname === '/api/v1/resume' && options && options.body instanceof FormData && !options.body.has('reviewed_resume_text')) {
            return reviewResume(options.body).then(function () { return authenticatedFetch(input, options); });
        }
        var version = generation;
        var controller = new AbortController();
        pending.add(controller);
        var opts = Object.assign({}, options || {}, {signal: controller.signal, cache: 'no-store'});
        opts.headers = new Headers(opts.headers || {});
        var token = sessionStorage.getItem(key);
        if (token) opts.headers.set('Authorization', 'Bearer ' + token);
        if (opts.body instanceof FormData) {
            ['code', 'applicant_code', 'student_code', 'student_email'].forEach(function (k) { opts.body.delete(k); });
        } else if (typeof opts.body === 'string' && (opts.headers.get('Content-Type') || '').includes('application/json')) {
            var body = JSON.parse(opts.body);
            ['code', 'student_code', 'applicant_code'].forEach(function (k) { delete body[k]; });
            opts.body = JSON.stringify(body);
        }
        return nativeFetch(url.href, opts).then(function (response) {
            if (version !== generation) throw stale();
            ['json', 'blob', 'text', 'arrayBuffer'].forEach(function (method) {
                if (!response[method]) return;
                var read = response[method].bind(response);
                response[method] = function () {
                    return read().then(function (data) { if (version !== generation) throw stale(); return data; });
                };
            });
            return response;
        }).finally(function () { pending.delete(controller); });
    }
    function login(code) {
        var previous = sessionStorage.getItem(key);
        invalidate();
        if (previous) nativeFetch(base() + '/api/v1/auth/logout', {method: 'POST', headers: {Authorization: 'Bearer ' + previous}}).catch(function () {});
        var version = generation;
        return nativeFetch(base() + '/api/v1/auth/login', {
            method: 'POST', cache: 'no-store', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({code: code.trim()})
        }).then(async function (response) {
            var data = await response.json();
            if (version !== generation) {
                if (data.token) nativeFetch(base() + '/api/v1/auth/logout', {method: 'POST', headers: {Authorization: 'Bearer ' + data.token}}).catch(function () {});
                throw stale();
            }
            if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not sign in.');
            sessionStorage.setItem(key, data.token);
            return authenticatedFetch(base() + '/api/v1/me/state').then(function (r) {
                if (!r.ok) { sessionStorage.removeItem(key); throw new Error('Could not restore your session. Please sign in again.'); }
                return r.json();
            });
        });
    }
    function reviewResume(form) {
        var version = generation;
        var preview = new FormData(); preview.set('resume', form.get('resume'));
        preview.set('cover_letter', form.get('cover_letter') || '');
        return authenticatedFetch(base() + '/api/v1/resume/preview', {method: 'POST', body: preview})
            .then(async function (response) {
                var data = await response.json();
                if (!response.ok) throw Error(typeof data.detail === 'string' ? data.detail : 'Could not read the PDF.');
                return new Promise(function (resolve, reject) {
                    var dialog = document.createElement('dialog');
                    dialog.className = 'wr-resume-review';
                    dialog.style.cssText = 'max-width:42rem;width:92vw;border:1px solid #cbd5e1;border-radius:12px;padding:1.5rem;';
                    var title = document.createElement('h2'); title.textContent = 'Review your simulation application';
                    var note = document.createElement('p'); note.textContent = 'Use fictional material. This is the filtered text sent for assessment. The filter can miss personal details; remove them here before continuing.';
                    var resume = document.createElement('textarea'); resume.value = data.resume_text; resume.rows = 12;
                    resume.setAttribute('aria-label', 'Filtered resume text'); resume.style.width = '100%';
                    var cover = document.createElement('textarea'); cover.value = data.cover_letter; cover.rows = 4;
                    cover.setAttribute('aria-label', 'Filtered cover letter'); cover.style.width = '100%';
                    var accept = document.createElement('button'); accept.type = 'button'; accept.className = 'btn btn-primary'; accept.textContent = 'Submit this reviewed text';
                    var cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn'; cancel.textContent = 'Cancel';
                    function dismiss() { dialog.remove(); reject(new DOMException('Application cancelled', 'AbortError')); }
                    cancel.onclick = dismiss; dialog.addEventListener('cancel', dismiss);
                    accept.onclick = function () {
                        if (!resume.value.trim()) { resume.focus(); return; }
                        if (version !== generation) { dismiss(); return; }
                        form.set('reviewed_resume_text', resume.value); form.set('cover_letter', cover.value);
                        dialog.remove(); resolve();
                    };
                    dialog.append(title, note, resume, cover, accept, cancel); document.body.append(dialog); dialog.showModal();
                });
            });
    }
    function logout() {
        var token = sessionStorage.getItem(key);
        invalidate();
        if (!token) return Promise.resolve();
        return nativeFetch(base() + '/api/v1/auth/logout', {method: 'POST', keepalive: true, headers: {Authorization: 'Bearer ' + token}}).catch(function () {});
    }
    // Never retain an old URL-handoff credential in history.
    var current = new URL(window.location.href);
    if (current.searchParams.has('code') || current.searchParams.has('student')) {
        current.searchParams.delete('code'); current.searchParams.delete('student');
        history.replaceState({}, '', current.pathname + current.search + current.hash);
    }
    window.WRSession = {fetch: authenticatedFetch, login: login, logout: logout,
        active: function () { return !!sessionStorage.getItem(key); },
        state: function () { return authenticatedFetch(base() + '/api/v1/me/state').then(function (r) {
            if (!r.ok) throw new Error('Your session has ended. Please sign in again.'); return r.json();
        }); }};
    document.addEventListener('DOMContentLoaded', function () {
        var form = document.getElementById('apply-form');
        if (!form) return;
        var label = form.querySelector('label[for="applicant_name"], label[for="apply-name"]');
        if (label) label.textContent = 'Persona name (invented)';
        var note = document.createElement('p');
        note.textContent = 'Use a synthetic PDF resume. Simulation activity is saved for lecturer review. Contact filtering is best-effort, not guaranteed anonymity. ';
        var link = document.createElement('a');
        link.href = 'https://workready.eduserver.au/privacy.html'; link.textContent = 'Data handling';
        note.appendChild(link); form.prepend(note);
    });
    // Downloads need the same session header as fetch calls; never put tokens in links.
    document.addEventListener('click', function (event) {
        var link = event.target.closest && event.target.closest('a[href]');
        if (!link) return;
        var url = new URL(link.href);
        if (url.origin !== new URL(base()).origin || !(/^\/api\/v1\/practice\//.test(url.pathname) || url.pathname.endsWith('/booking.ics'))) return;
        event.preventDefault();
        authenticatedFetch(url.href).then(function (response) {
            if (!response.ok) throw new Error('Please sign in again before downloading.');
            return response.blob();
        }).then(function (blob) {
            var objectURL = URL.createObjectURL(blob);
            var download = document.createElement('a'); download.href = objectURL;
            download.download = url.pathname.split('/').pop();
            document.body.appendChild(download); download.click(); download.remove();
            setTimeout(function () { URL.revokeObjectURL(objectURL); }, 30000);
        }).catch(function (error) {
            if (error.name !== 'AbortError') window.dispatchEvent(new CustomEvent('workready:error', {detail: error.message}));
        });
    });
})();
