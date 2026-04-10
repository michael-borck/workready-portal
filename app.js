/* WorkReady Portal — single-page app */

(function () {
    'use strict';

    var CONFIG = window.WORKREADY_CONFIG;
    var state = {
        email: null,
        student: null,
        currentView: 'dashboard',
        interview: null,  // active interview session, when in the chat
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
        navInterview: $('nav-interview'),
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
        primerIframe: $('primer-iframe'),
        stateBadgeLabel: $('state-badge-label'),
        // Interview view elements
        interviewPre: $('interview-pre'),
        interviewChat: $('interview-chat'),
        interviewResult: $('interview-result'),
        interviewManagerName: $('interview-manager-name'),
        interviewManagerRole: $('interview-manager-role'),
        interviewTurnIndicator: $('interview-turn-indicator'),
        interviewEndBtn: $('interview-end-btn'),
        interviewMessages: $('interview-messages'),
        interviewInputForm: $('interview-input-form'),
        interviewInput: $('interview-input'),
        interviewSendBtn: $('interview-send-btn'),
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
        els.stateBadgeLabel.textContent = stateLabel(s.state);
        els.stateBadge.className = 'state-badge state-' + s.state.toLowerCase();

        // Unread badges
        updateBadge(els.unreadPersonal, s.unread_personal);
        updateBadge(els.unreadWork, s.unread_work);

        // Show/hide work-only nav items
        var hired = s.state === 'HIRED' || s.state === 'COMPLETED';
        var inInterviewStage = hired && s.active_application
            && s.active_application.current_stage === 'interview';
        toggle(els.navInboxWork, hired);
        toggle(els.navInterview, inInterviewStage);
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

        // Pass student email to seek.jobs so it can show personalised state
        // (blocked jobs, application status, pre-fill apply form)
        if (state.email) {
            els.jobBoardLink.href = CONFIG.JOBS_URL + '?student=' + encodeURIComponent(state.email);
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
            var stage = s.active_application.current_stage;
            var atInterview = stage === 'interview';
            els.dashboardTitle.textContent = atInterview
                ? 'You\'ve made it to interview at ' + companyName(company) + '!'
                : 'Welcome to ' + companyName(company);

            if (atInterview) {
                html =
                    '<p>Congratulations — your application for the <strong>' +
                    escapeHtml(s.active_application.job_title) + '</strong> role at ' +
                    companyName(company) + ' has progressed to the interview stage.</p>' +
                    '<p>Your interview will be a conversation with the hiring manager. ' +
                    'It should take around 15 minutes. Take your time, and remember — this is a ' +
                    'safe space to practice.</p>' +
                    '<div class="action-buttons">' +
                    '<button id="dashboard-start-interview-btn" class="btn btn-primary btn-cta">' +
                    '&#127908; Start Interview</button>' +
                    '<a href="' + CONFIG.COMPANY_URLS[company] + '" target="_blank" class="btn btn-secondary">' +
                    'Review Company Intranet</a>' +
                    '</div>';
            } else {
                html =
                    '<p>You are now an intern at ' + companyName(company) + ', working as a ' +
                    '<strong>' + escapeHtml(s.active_application.job_title) + '</strong>.</p>' +
                    '<p>Your current stage: <strong>' + stageLabel(stage) + '</strong></p>' +
                    '<div class="action-buttons">' +
                    '<a href="' + CONFIG.COMPANY_URLS[company] + '" target="_blank" class="btn btn-primary">' +
                    'Visit Company Intranet</a>' +
                    '</div>';
            }
            html += '<h3 style="margin-top: 2rem;">Your Application History</h3>' +
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
            dashPrimerBtn.addEventListener('click', function () {
                switchView('primer');
            });
        }

        // Wire dashboard start-interview button if present
        var dashInterviewBtn = $('dashboard-start-interview-btn');
        if (dashInterviewBtn) {
            dashInterviewBtn.addEventListener('click', function () {
                switchView('interview');
            });
        }
    }

    function renderApplicationList(apps) {
        if (!apps || apps.length === 0) {
            return '<div class="placeholder">No applications yet.</div>';
        }
        var html = '<div class="app-list">';
        apps.forEach(function (a) {
            var statusBadge = renderStatusBadge(a);
            var cardClass = 'app-card app-card-' + (a.status || 'active');
            html +=
                '<div class="' + cardClass + '">' +
                '<div class="app-card-title">' + escapeHtml(a.job_title) + '</div>' +
                '<div class="app-card-meta">' + escapeHtml(companyName(a.company_slug)) + '</div>' +
                statusBadge +
                '</div>';
        });
        html += '</div>';
        return html;
    }

    function renderStatusBadge(app) {
        var status = app.status || 'active';
        if (status === 'rejected') {
            return '<span class="app-stage app-stage-rejected">Rejected at ' +
                stageLabel(app.current_stage) + ' stage</span>';
        }
        if (status === 'hired') {
            return '<span class="app-stage app-stage-hired">Hired</span>';
        }
        if (status === 'completed') {
            return '<span class="app-stage app-stage-completed">Completed</span>';
        }
        return '<span class="app-stage">Stage: ' + stageLabel(app.current_stage) + '</span>';
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
        if (view === 'primer') loadPrimerIframe();
        if (view === 'interview') loadInterview();
    }

    function loadPrimerIframe() {
        // Lazy-load on first open
        if (!els.primerIframe.src) {
            els.primerIframe.src = CONFIG.PRIMER_URL;
        }
    }

    // --- Interview view ---

    function loadInterview() {
        var s = state.student;
        if (!s || !s.active_application) {
            renderInterviewIdle('You don\'t have an active interview right now.');
            return;
        }

        var app = s.active_application;
        if (app.current_stage !== 'interview') {
            renderInterviewIdle('Your current application is at the ' +
                stageLabel(app.current_stage) + ' stage, not interview.');
            return;
        }

        // Show the pre-interview state with a "Begin" button
        renderInterviewPre(app);
    }

    function renderInterviewIdle(message) {
        els.interviewPre.classList.remove('hidden');
        els.interviewChat.classList.add('hidden');
        els.interviewResult.classList.add('hidden');
        els.interviewPre.innerHTML =
            '<div class="placeholder">' + escapeHtml(message) + '</div>';
    }

    function renderInterviewPre(app) {
        els.interviewPre.classList.remove('hidden');
        els.interviewChat.classList.add('hidden');
        els.interviewResult.classList.add('hidden');
        var practiceUrl = CONFIG.API_BASE + '/api/v1/jobs/' +
            encodeURIComponent(app.company_slug) + '/' +
            encodeURIComponent(app.job_slug) + '/practice-script';
        els.interviewPre.innerHTML =
            '<h2>Ready to interview?</h2>' +
            '<p>You\'re about to interview for the <strong>' +
            escapeHtml(app.job_title) + '</strong> role at ' +
            escapeHtml(companyName(app.company_slug)) + '.</p>' +
            '<p>The interview will be a conversation with the hiring manager. ' +
            'Take your time, think through your answers, and stay in the moment. ' +
            'There are roughly 10 questions and the interview should take about 15 minutes.</p>' +
            '<p><strong>This is a safe space to practise.</strong> If it doesn\'t go well, ' +
            'you\'ll get feedback to learn from and can apply to other roles.</p>' +
            '<div class="action-buttons">' +
            '<button id="interview-begin-btn" class="btn btn-primary btn-cta">' +
            'Begin Interview</button>' +
            '<a href="' + practiceUrl + '" download class="btn btn-secondary">' +
            '&#128221; Download practice script</a>' +
            '</div>' +
            '<p class="practice-blurb">Want to rehearse first? Download the practice script ' +
            'and use it with <a href="' + escapeHtml(CONFIG.TALK_BUDDY_URL) + '" target="_blank">Talk Buddy</a> ' +
            'or any AI chat tool to practise as many times as you like.</p>';
        $('interview-begin-btn').addEventListener('click', startInterview);
    }

    function startInterview() {
        var app = state.student.active_application;
        var beginBtn = $('interview-begin-btn');
        if (beginBtn) {
            beginBtn.disabled = true;
            beginBtn.textContent = 'Connecting to interviewer...';
        }
        fetch(CONFIG.API_BASE + '/api/v1/interview/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ application_id: app.id }),
        })
            .then(function (r) {
                if (!r.ok) throw new Error('Could not start interview');
                return r.json();
            })
            .then(function (session) {
                state.interview = session;
                showInterviewChat(session);
            })
            .catch(function (err) {
                if (beginBtn) {
                    beginBtn.disabled = false;
                    beginBtn.textContent = 'Begin Interview';
                }
                alert('Failed to start interview: ' + err.message);
            });
    }

    function showInterviewChat(session) {
        els.interviewPre.classList.add('hidden');
        els.interviewChat.classList.remove('hidden');
        els.interviewResult.classList.add('hidden');

        els.interviewManagerName.textContent = session.manager_name;
        els.interviewManagerRole.textContent = session.manager_role
            ? session.manager_role + ' at ' + session.company_name
            : session.company_name;

        renderTranscript(session.transcript);
        updateTurnIndicator(session.turn, session.target_turns);

        els.interviewInput.value = '';
        els.interviewInput.focus();
    }

    function renderTranscript(messages) {
        var html = '';
        messages.forEach(function (m) {
            var who = m.role === 'assistant' ? 'manager' : 'student';
            html += '<div class="interview-msg interview-msg-' + who + '">' +
                '<div class="interview-msg-bubble">' +
                escapeHtml(m.content).replace(/\n/g, '<br>') +
                '</div></div>';
        });
        els.interviewMessages.innerHTML = html;
        // Scroll to bottom
        els.interviewMessages.scrollTop = els.interviewMessages.scrollHeight;
    }

    function appendMessage(role, content) {
        var who = role === 'assistant' ? 'manager' : 'student';
        var div = document.createElement('div');
        div.className = 'interview-msg interview-msg-' + who;
        div.innerHTML = '<div class="interview-msg-bubble">' +
            escapeHtml(content).replace(/\n/g, '<br>') + '</div>';
        els.interviewMessages.appendChild(div);
        els.interviewMessages.scrollTop = els.interviewMessages.scrollHeight;
    }

    function appendThinking() {
        var div = document.createElement('div');
        div.className = 'interview-msg interview-msg-manager';
        div.id = 'interview-thinking';
        div.innerHTML = '<div class="interview-msg-bubble interview-thinking">' +
            '<span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
        els.interviewMessages.appendChild(div);
        els.interviewMessages.scrollTop = els.interviewMessages.scrollHeight;
    }

    function removeThinking() {
        var t = $('interview-thinking');
        if (t) t.remove();
    }

    function updateTurnIndicator(turn, target) {
        if (!els.interviewTurnIndicator) return;
        var displayTurn = Math.max(turn, 0);
        els.interviewTurnIndicator.textContent =
            'Question ' + (displayTurn + 1) + ' of ~' + target;
    }

    function sendInterviewMessage(e) {
        e.preventDefault();
        if (!state.interview) return;
        var msg = els.interviewInput.value.trim();
        if (!msg) return;

        appendMessage('user', msg);
        els.interviewInput.value = '';
        els.interviewSendBtn.disabled = true;
        els.interviewInput.disabled = true;
        appendThinking();

        fetch(CONFIG.API_BASE + '/api/v1/interview/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: state.interview.session_id,
                message: msg,
            }),
        })
            .then(function (r) {
                if (!r.ok) throw new Error('Reply failed');
                return r.json();
            })
            .then(function (reply) {
                removeThinking();
                appendMessage('assistant', reply.reply);
                updateTurnIndicator(reply.turn, reply.target_turns);
                els.interviewSendBtn.disabled = false;
                els.interviewInput.disabled = false;
                els.interviewInput.focus();
                if (reply.suggested_wrap_up) {
                    els.interviewTurnIndicator.textContent += ' (wrapping up)';
                }
            })
            .catch(function (err) {
                removeThinking();
                appendMessage('assistant',
                    '[Connection error: ' + err.message + '. Try again.]');
                els.interviewSendBtn.disabled = false;
                els.interviewInput.disabled = false;
            });
    }

    function endInterview() {
        if (!state.interview) return;
        if (!confirm('End the interview now? You won\'t be able to add more messages.')) {
            return;
        }
        els.interviewEndBtn.disabled = true;
        els.interviewEndBtn.textContent = 'Closing interview...';
        appendThinking();

        fetch(CONFIG.API_BASE + '/api/v1/interview/' + state.interview.session_id + '/end', {
            method: 'POST',
        })
            .then(function (r) {
                if (!r.ok) throw new Error('Could not end interview');
                return r.json();
            })
            .then(function (session) {
                removeThinking();
                state.interview = null;
                showInterviewResult(session);
                // Refresh student state to reflect new application status
                loadStudentState();
            })
            .catch(function (err) {
                removeThinking();
                alert('Failed to end interview: ' + err.message);
                els.interviewEndBtn.disabled = false;
                els.interviewEndBtn.textContent = 'End interview';
            });
    }

    function showInterviewResult(session) {
        els.interviewPre.classList.add('hidden');
        els.interviewChat.classList.add('hidden');
        els.interviewResult.classList.remove('hidden');

        var fb = session.feedback || {};
        var passed = fb.proceed === true;
        var feedback = fb.feedback || {};

        // Pull company/job info from the session for the practice script link
        var app = state.student && state.student.applications
            ? state.student.applications.find(function (a) {
                return a.id === session.application_id;
            })
            : null;
        var practiceUrl = '';
        if (app) {
            practiceUrl = CONFIG.API_BASE + '/api/v1/jobs/' +
                encodeURIComponent(app.company_slug) + '/' +
                encodeURIComponent(app.job_slug) + '/practice-script';
        }

        var html =
            '<h2>' + (passed
                ? 'You\'re moving forward'
                : 'Interview complete') + '</h2>' +
            '<p class="interview-result-summary">' +
            escapeHtml(fb.summary || '') + '</p>' +
            '<div class="interview-result-score">' +
            'Overall: <strong>' + (session.final_score || 0) + '/100</strong></div>' +
            renderFeedbackSection('What worked well', feedback.strengths) +
            renderFeedbackSection('Areas for improvement', feedback.gaps) +
            renderFeedbackSection('Suggestions', feedback.suggestions) +
            (feedback.tailoring ? '<p class="interview-result-tailoring">' +
                escapeHtml(feedback.tailoring) + '</p>' : '') +
            '<div class="action-buttons">' +
            '<button id="interview-back-btn" class="btn btn-primary">Back to dashboard</button>' +
            (practiceUrl
                ? '<a href="' + practiceUrl + '" download class="btn btn-secondary">' +
                  '&#128221; Download practice script</a>'
                : '') +
            '</div>' +
            (practiceUrl
                ? '<p class="practice-blurb">' +
                  (passed
                      ? 'Want to keep practising? Download a practice script for similar roles.'
                      : 'Want to do better next time? Download a practice script and use it with ' +
                        '<a href="' + escapeHtml(CONFIG.TALK_BUDDY_URL) + '" target="_blank">Talk Buddy</a> ' +
                        'or any AI chat tool to rehearse before applying again.') +
                  '</p>'
                : '');
        els.interviewResult.innerHTML = html;
        $('interview-back-btn').addEventListener('click', function () {
            switchView('dashboard');
        });
    }

    function renderFeedbackSection(title, items) {
        if (!items || items.length === 0) return '';
        var html = '<div class="interview-result-section">' +
            '<h3>' + escapeHtml(title) + '</h3><ul>';
        items.forEach(function (item) {
            html += '<li>' + escapeHtml(item) + '</li>';
        });
        html += '</ul></div>';
        return html;
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

    // Interview chat events
    if (els.interviewInputForm) {
        els.interviewInputForm.addEventListener('submit', sendInterviewMessage);
    }
    if (els.interviewEndBtn) {
        els.interviewEndBtn.addEventListener('click', endInterview);
    }
    // Submit on Cmd/Ctrl+Enter
    if (els.interviewInput) {
        els.interviewInput.addEventListener('keydown', function (e) {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                sendInterviewMessage(e);
            }
        });
    }

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
