/* WorkReady Portal — single-page app */

(function () {
    'use strict';

    var CONFIG = window.WORKREADY_CONFIG;
    var state = {
        email: null,
        student: null,
        currentView: 'dashboard',
    };

    // --- Element references ---
    var $ = function (id) { return document.getElementById(id); };
    var els = {
        signin: $('signin'),
        signinForm: $('signin-form'),
        emailInput: $('email'),
        app: $('app'),
        userName: $('user-name'),
        stateBadge: $('state-badge'),
        signoutBtn: $('signout-btn'),
        navItems: document.querySelectorAll('.nav-item'),
        navInboxWork: $('nav-inbox-work'),
        navTasks: $('nav-tasks'),
        navTeam: $('nav-team'),
        unreadPersonal: $('unread-personal'),
        unreadWork: $('unread-work'),
        intranetLink: $('intranet-link'),
        jobBoardLink: $('job-board-link'),
        dashboardTitle: $('dashboard-title'),
        dashboardContent: $('dashboard-content'),
        inboxPersonalList: $('inbox-personal-list'),
        inboxWorkList: $('inbox-work-list'),
        modal: $('message-modal'),
        modalClose: $('modal-close'),
        primerLink: $('primer-link'),
        primerModal: $('primer-modal'),
        primerClose: $('primer-close'),
        primerIframe: $('primer-iframe'),
        modalSubject: $('modal-subject'),
        modalSender: $('modal-sender'),
        modalRole: $('modal-role'),
        modalDate: $('modal-date'),
        modalBody: $('modal-body'),
    };

    // --- API helpers ---
    function api(path, opts) {
        opts = opts || {};
        return fetch(CONFIG.API_BASE + path, opts).then(function (r) {
            if (!r.ok) throw new Error('API error: ' + r.status);
            return r.json();
        });
    }

    // --- Sign-in / sign-out ---
    function signIn(email) {
        state.email = email;
        localStorage.setItem('workready_email', email);
        els.signin.classList.add('hidden');
        els.app.classList.remove('hidden');
        loadStudentState();
    }

    function signOut() {
        state.email = null;
        state.student = null;
        localStorage.removeItem('workready_email');
        els.app.classList.add('hidden');
        els.signin.classList.remove('hidden');
        els.emailInput.value = '';
        resetTheme();
    }

    // --- Theme switching ---
    function applyCompanyTheme(companySlug) {
        var theme = CONFIG.COMPANY_THEMES[companySlug];
        if (!theme) return;
        Object.keys(theme).forEach(function (key) {
            document.documentElement.style.setProperty(key, theme[key]);
        });
    }

    function resetTheme() {
        var keys = ['--sim-primary', '--sim-primary-dark', '--sim-accent', '--sim-bg'];
        keys.forEach(function (key) {
            document.documentElement.style.removeProperty(key);
        });
    }

    // --- State loading ---
    function loadStudentState() {
        api('/api/v1/student/' + encodeURIComponent(state.email) + '/state')
            .then(function (data) {
                state.student = data;
                renderState();
            })
            .catch(function (err) {
                console.error('Failed to load state:', err);
                els.dashboardContent.innerHTML =
                    '<p class="placeholder">Could not connect to WorkReady API. ' +
                    'Make sure the backend is running at ' + CONFIG.API_BASE + '</p>';
            });
    }

    function renderState() {
        var s = state.student;
        if (!s) return;

        // Header
        els.userName.textContent = s.name || s.email;
        els.stateBadge.textContent = stateLabel(s.state);
        els.stateBadge.className = 'state-badge state-' + s.state.toLowerCase();

        // Unread badges
        updateBadge(els.unreadPersonal, s.unread_personal);
        updateBadge(els.unreadWork, s.unread_work);

        // Show/hide work-only nav items
        var hired = s.state === 'HIRED' || s.state === 'COMPLETED';
        toggle(els.navInboxWork, hired);
        toggle(els.navTasks, hired);
        toggle(els.navTeam, hired);
        toggle(els.intranetLink, hired);

        // Apply company theme if hired
        if (hired && s.active_application) {
            applyCompanyTheme(s.active_application.company_slug);
            els.intranetLink.href = CONFIG.COMPANY_URLS[s.active_application.company_slug] || '#';
            // Job board greys out post-hire
            els.jobBoardLink.style.opacity = '0.4';
            els.jobBoardLink.style.pointerEvents = 'none';
        } else {
            resetTheme();
            els.jobBoardLink.style.opacity = '';
            els.jobBoardLink.style.pointerEvents = '';
        }

        // Render the current view
        if (state.currentView === 'dashboard') renderDashboard();
        if (state.currentView === 'inbox-personal') loadInbox('personal');
        if (state.currentView === 'inbox-work') loadInbox('work');
    }

    function stateLabel(state) {
        return ({
            NOT_APPLIED: 'Not Applied',
            APPLIED: 'Application Under Review',
            HIRED: 'Employed',
            COMPLETED: 'Internship Complete',
        })[state] || state;
    }

    function updateBadge(el, count) {
        if (!el) return;
        if (count > 0) {
            el.textContent = count;
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    }

    function toggle(el, show) {
        if (!el) return;
        if (show) el.classList.remove('hidden');
        else el.classList.add('hidden');
    }

    // --- Dashboard ---
    function renderDashboard() {
        var s = state.student;
        var html = '';

        if (s.state === 'NOT_APPLIED') {
            els.dashboardTitle.textContent = 'Welcome to WorkReady, ' + (s.name || 'student') + '!';
            html =
                '<div class="dashboard-empty">' +
                '<h3>Ready to start your internship journey?</h3>' +
                '<p>Begin with the interactive primer to learn what to expect, ' +
                'then browse the job board to find a role that interests you.</p>' +
                '<div class="action-buttons">' +
                '<button id="dashboard-primer-btn" class="btn btn-primary">' +
                'Play the Primer</button>' +
                '<a href="' + CONFIG.JOBS_URL + '" target="_blank" class="btn btn-primary">' +
                'Browse seek.jobs</a>' +
                '</div>' +
                '</div>';
        } else if (s.state === 'APPLIED') {
            els.dashboardTitle.textContent = 'Application Under Review';
            html =
                '<p>You have applied for the following role. Check your personal inbox for updates.</p>' +
                renderApplicationList(s.applications);
        } else if (s.state === 'HIRED') {
            var company = s.active_application.company_slug;
            els.dashboardTitle.textContent = 'Welcome to ' + companyName(company);
            html =
                '<p>You are now an intern at ' + companyName(company) + ', working as a ' +
                '<strong>' + escapeHtml(s.active_application.job_title) + '</strong>.</p>' +
                '<p>Your current stage: <strong>' + stageLabel(s.active_application.current_stage) + '</strong></p>' +
                '<div class="action-buttons">' +
                '<a href="' + CONFIG.COMPANY_URLS[company] + '" target="_blank" class="btn btn-primary">' +
                'Visit Company Intranet</a>' +
                '</div>' +
                '<h3 style="margin-top: 2rem;">Your Application History</h3>' +
                renderApplicationList(s.applications);
        } else if (s.state === 'COMPLETED') {
            els.dashboardTitle.textContent = 'Internship Complete';
            html =
                '<p>Congratulations on completing your WorkReady internship simulation!</p>' +
                renderApplicationList(s.applications);
        }

        els.dashboardContent.innerHTML = html;

        // Wire dashboard primer button if present
        var dashPrimerBtn = $('dashboard-primer-btn');
        if (dashPrimerBtn) {
            dashPrimerBtn.addEventListener('click', openPrimer);
        }
    }

    function renderApplicationList(apps) {
        if (!apps || apps.length === 0) {
            return '<div class="placeholder">No applications yet.</div>';
        }
        var html = '<div class="app-list">';
        apps.forEach(function (a) {
            html +=
                '<div class="app-card">' +
                '<div class="app-card-title">' + escapeHtml(a.job_title) + '</div>' +
                '<div class="app-card-meta">' + escapeHtml(companyName(a.company_slug)) + '</div>' +
                '<span class="app-stage">Stage: ' + stageLabel(a.current_stage) + '</span>' +
                '</div>';
        });
        html += '</div>';
        return html;
    }

    function companyName(slug) {
        return ({
            'nexuspoint-systems': 'NexusPoint Systems',
            'ironvale-resources': 'IronVale Resources',
            'meridian-advisory': 'Meridian Advisory',
            'metro-council-wa': 'Metro Council WA',
            'southern-cross-financial': 'Southern Cross Financial',
            'horizon-foundation': 'Horizon Foundation',
        })[slug] || slug;
    }

    function stageLabel(stage) {
        return ({
            'job_board': 'Browsing jobs',
            'resume': 'Application under review',
            'interview': 'Interview scheduled',
            'work_task': 'Work task in progress',
            'lunchroom': 'Workplace social',
            'exit_interview': 'Exit interview',
            'completed': 'Completed',
        })[stage] || stage;
    }

    // --- Inbox ---
    function loadInbox(inbox) {
        api('/api/v1/inbox/' + encodeURIComponent(state.email) + '?inbox=' + inbox)
            .then(function (data) {
                renderInbox(inbox, data);
            })
            .catch(function (err) {
                console.error('Failed to load inbox:', err);
            });
    }

    function renderInbox(inbox, data) {
        var listEl = inbox === 'personal' ? els.inboxPersonalList : els.inboxWorkList;
        if (!data.messages || data.messages.length === 0) {
            listEl.innerHTML = '<div class="empty-inbox">No messages yet.</div>';
            return;
        }

        var html = '';
        data.messages.forEach(function (m) {
            var unreadClass = m.is_read ? '' : ' unread';
            var preview = m.body.split('\n')[0].substring(0, 100);
            html +=
                '<div class="message-item' + unreadClass + '" data-message-id="' + m.id + '">' +
                '<div class="message-header">' +
                '<span class="message-sender">' + escapeHtml(m.sender_name) + '</span>' +
                '<span class="message-date">' + formatDate(m.deliver_at) + '</span>' +
                '</div>' +
                '<div class="message-subject">' + escapeHtml(m.subject) + '</div>' +
                '<div class="message-preview">' + escapeHtml(preview) + '</div>' +
                '</div>';
        });
        listEl.innerHTML = html;

        // Bind click handlers
        listEl.querySelectorAll('.message-item').forEach(function (item) {
            item.addEventListener('click', function () {
                var id = parseInt(item.getAttribute('data-message-id'), 10);
                var msg = data.messages.find(function (m) { return m.id === id; });
                openMessage(msg);
            });
        });
    }

    function openMessage(msg) {
        els.modalSubject.textContent = msg.subject;
        els.modalSender.textContent = msg.sender_name;
        els.modalRole.textContent = msg.sender_role ? '(' + msg.sender_role + ')' : '';
        els.modalDate.textContent = formatDate(msg.deliver_at);
        els.modalBody.textContent = msg.body;
        els.modal.classList.remove('hidden');

        if (!msg.is_read) {
            api('/api/v1/inbox/message/' + msg.id + '/read', { method: 'POST' })
                .then(function () { loadStudentState(); });
        }
    }

    function closeModal() {
        els.modal.classList.add('hidden');
    }

    // --- View switching ---
    function switchView(view) {
        state.currentView = view;
        document.querySelectorAll('.view').forEach(function (v) {
            v.classList.add('hidden');
        });
        var target = $('view-' + view);
        if (target) target.classList.remove('hidden');

        els.navItems.forEach(function (item) {
            if (item.getAttribute('data-view') === view) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        if (view === 'dashboard') renderDashboard();
        if (view === 'inbox-personal') loadInbox('personal');
        if (view === 'inbox-work') loadInbox('work');
    }

    // --- Helpers ---
    function escapeHtml(str) {
        if (str == null) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function formatDate(iso) {
        try {
            var d = new Date(iso);
            return d.toLocaleString('en-AU', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            });
        } catch (e) {
            return iso;
        }
    }

    // --- Event bindings ---
    els.signinForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = els.emailInput.value.trim();
        if (email) signIn(email);
    });

    els.signoutBtn.addEventListener('click', signOut);

    els.navItems.forEach(function (item) {
        item.addEventListener('click', function () {
            var view = item.getAttribute('data-view');
            switchView(view);
        });
    });

    els.modalClose.addEventListener('click', closeModal);
    els.modal.addEventListener('click', function (e) {
        if (e.target === els.modal) closeModal();
    });

    // Primer modal
    function openPrimer() {
        if (!els.primerIframe.src) {
            els.primerIframe.src = CONFIG.PRIMER_URL;
        }
        els.primerModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function closePrimer() {
        els.primerModal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    els.primerLink.addEventListener('click', openPrimer);
    els.primerClose.addEventListener('click', closePrimer);

    // ESC key closes primer
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !els.primerModal.classList.contains('hidden')) {
            closePrimer();
        }
    });

    // --- Initial load ---
    var savedEmail = localStorage.getItem('workready_email');
    if (savedEmail) {
        signIn(savedEmail);
    }

    // Refresh state every 30 seconds (catches new messages, stage transitions)
    setInterval(function () {
        if (state.email) loadStudentState();
    }, 30000);
})();
