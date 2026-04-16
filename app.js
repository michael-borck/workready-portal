/* WorkReady Portal — single-page app */

(function () {
    'use strict';

    var CONFIG = window.WORKREADY_CONFIG;

    // --- Timezone handling ---
    // Detect the student's browser timezone once on load. Business hours
    // on the API side are still in Perth (the company's timezone), but
    // appointment times displayed to the student are converted to their
    // local timezone so "Monday 10am" isn't confusing for a student in
    // Brisbane (+2h) or Sydney (+3h).
    function detectTimezone() {
        var saved = localStorage.getItem('workready_tz');
        if (saved) return saved;
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch (e) {
            return 'Australia/Perth';
        }
    }

    var state = {
        email: null,
        student: null,
        currentView: 'dashboard',
        interview: null,  // active interview session, when in the chat
        timezone: detectTimezone(),
    };

    function formatInTimezone(isoString, options) {
        options = options || {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZoneName: 'short',
        };
        options.timeZone = state.timezone;
        try {
            return new Date(isoString).toLocaleString('en-AU', options);
        } catch (e) {
            return isoString;
        }
    }

    function isLocalTzPerth() {
        return state.timezone === 'Australia/Perth';
    }

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
        talkBuddyLink: $('talk-buddy-link'),
        careerCompassLink: $('career-compass-link'),
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
        var workEmailSection = $('nav-work-email-section');
        if (workEmailSection) toggle(workEmailSection, hired);
        toggle(els.navInterview, inInterviewStage);
        toggle(els.navTasks, hired);
        toggle(els.navTeam, hired);
        toggle($('nav-lunchroom'), hired);
        var inExitStage = hired && s.active_application
            && s.active_application.current_stage === 'exit';
        toggle($('nav-exit-interview'), inExitStage || s.state === 'COMPLETED');
        // Perf review nav: visible during placement stage. The route
        // returns a friendly 400 if task 2 isn't yet submitted, so the
        // student can see the nav item but won't be able to start until
        // the trigger has fired.
        var inWorkTaskStage = hired && s.active_application
            && s.active_application.current_stage === 'placement';
        toggle($('nav-perf-review'), inWorkTaskStage);
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
            // Resign option — deliberately small and non-prominent, only
            // shown once the student is actually on placement (post-interview).
            if (stage !== 'interview') {
                html += '<div class="dashboard-resign-row">' +
                    '<button id="dashboard-resign-btn" class="btn btn-link dashboard-resign-link">' +
                    'Need to resign from this placement?</button>' +
                    '</div>';
            }
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

        // Wire resign link
        var resignBtn = $('dashboard-resign-btn');
        if (resignBtn) {
            resignBtn.addEventListener('click', resignFromPlacement);
        }
    }

    function resignFromPlacement() {
        var s = state.student;
        if (!s || !s.active_application) return;
        var app = s.active_application;
        var company = companyName(app.company_slug);
        var msg =
            'Resign from your placement at ' + company + '?\n\n' +
            'This will end your internship at ' + company + ' immediately. ' +
            'You will be able to apply to a different company on the job board ' +
            '(up to 3 placement attempts total), but you cannot reapply to ' +
            company + '.\n\n' +
            'This action cannot be undone.';
        if (!confirm(msg)) return;

        fetch(CONFIG.API_BASE + '/api/v1/application/' + app.id + '/resign', {
            method: 'POST',
        })
            .then(function (r) {
                if (!r.ok) {
                    return r.json().then(function (e) {
                        throw new Error(e.detail || 'Resign failed');
                    });
                }
                return r.json();
            })
            .then(function (result) {
                var followup = result.can_reapply
                    ? 'You can now apply to a different company on the job board.'
                    : 'You have used all your placement attempts for this program. ' +
                      'Speak to your lecturer if you need another chance.';
                alert('Resigned successfully.\n\n' + followup);
                loadStudentState();
                switchView('dashboard');
            })
            .catch(function (err) {
                alert('Could not resign: ' + err.message);
            });
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
            'placement': 'Work task in progress',
            'mid_placement': 'Workplace social',
            'exit': 'Exit interview',
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
        mailState.currentMessage = msg;
        els.modalSubject.textContent = msg.subject;
        els.modalSender.textContent = msg.sender_name;
        els.modalRole.textContent = msg.sender_role ? '(' + msg.sender_role + ')' : '';
        if (modalSenderEmail) {
            var se = msg.sender_email || '';
            modalSenderEmail.textContent = se;
            modalSenderEmail.style.display = se && se !== 'noreply@workready.eduserver.au' ? 'block' : 'none';
        }
        els.modalDate.textContent = formatDate(msg.deliver_at);
        els.modalBody.textContent = msg.body;

        // Show/hide reply button based on sender type
        if (modalReplyBtn) {
            var isNoreply = !msg.sender_email || msg.sender_email.indexOf('noreply') !== -1;
            modalReplyBtn.style.display = isNoreply ? 'none' : 'inline-flex';
        }

        els.modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        if (!msg.is_read) {
            api('/api/v1/inbox/message/' + msg.id + '/read', { method: 'POST' })
                .then(function () { loadStudentState(); });
        }
    }

    function closeModal() {
        els.modal.classList.add('hidden');
        document.body.style.overflow = '';
        mailState.currentMessage = null;
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
        if (view === 'sent') loadSentBox();
        if (view === 'sent-work') loadSentBox();  // reuses same loader
        if (view === 'primer') loadPrimerIframe();
        if (view === 'interview') loadInterview();
        if (view === 'lunchroom') loadLunchroom();
        if (view !== 'lunchroom') stopLunchroomPoll();
        if (view === 'exit-interview') loadExitInterview();
        if (view === 'perf-review') loadPerfReview();
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

        // Check if booking is enabled by fetching booking state
        api('/api/v1/interview/' + app.id + '/booking')
            .then(function (booking) {
                if (!booking.booking_enabled) {
                    // Booking disabled — go straight to the pre-interview screen
                    renderInterviewPre(app);
                    return;
                }
                renderInterviewBookingFlow(app, booking);
            })
            .catch(function () {
                // Fallback: assume booking is disabled
                renderInterviewPre(app);
            });
    }

    function renderInterviewBookingFlow(app, booking) {
        // Compute which sub-state we're in
        if (!booking.can_book && booking.missed_count >= booking.max_missed) {
            renderInterviewIdle(
                'This application has been closed because you missed too many ' +
                'scheduled interviews. Apply for another role to try again.'
            );
            return;
        }

        if (!booking.booking) {
            // No booking yet — show preference form
            renderBookingPreferences(app, booking);
            return;
        }

        // Booking exists — check timing
        var scheduled = new Date(booking.booking.scheduled_at);
        var now = new Date();
        var graceMs = 5 * 60 * 1000;  // server-authoritative; this is just for UI
        var earliest = new Date(scheduled.getTime() - graceMs);
        var latest = new Date(scheduled.getTime() + graceMs);

        if (now < earliest) {
            renderBookingScheduled(app, booking);
        } else if (now > latest) {
            // Late — server will reject. Show "you missed it" and offer rebook.
            // Refresh booking state from server to get latest counter
            api('/api/v1/interview/' + app.id + '/booking')
                .then(function (refreshed) {
                    renderBookingPreferences(app, refreshed, /* missedRecently= */ true);
                });
        } else {
            // Within window — show the pre-interview screen
            renderInterviewPre(app);
        }
    }

    function renderBookingPreferences(app, booking, missedRecently) {
        els.interviewPre.classList.remove('hidden');
        els.interviewChat.classList.add('hidden');
        els.interviewResult.classList.add('hidden');

        var missedNote = '';
        if (missedRecently) {
            missedNote =
                '<div class="booking-missed-note">' +
                '&#9888; You missed your scheduled appointment. Please book a new time.' +
                '</div>';
        }

        var rejectionWarning = '';
        if (booking.rejection_imminent) {
            rejectionWarning =
                '<div class="booking-warning">' +
                '&#9888; This is your last chance — one more missed appointment ' +
                'will close your application.' +
                '</div>';
        } else if (booking.missed_count > 0) {
            rejectionWarning =
                '<div class="booking-info">' +
                'You have missed ' + booking.missed_count + ' of ' +
                booking.max_missed + ' allowed appointments.' +
                '</div>';
        }

        els.interviewPre.innerHTML =
            '<h2>Schedule your interview</h2>' +
            '<p>You\'re interviewing for the <strong>' +
            escapeHtml(app.job_title) + '</strong> role at ' +
            escapeHtml(companyName(app.company_slug)) + '. ' +
            'Tell us when you\'re available and we\'ll show you the matching times.</p>' +
            missedNote +
            rejectionWarning +
            '<form id="booking-prefs-form" class="booking-prefs">' +
            '<fieldset class="booking-prefs-section">' +
            '<legend>Days you can do</legend>' +
            '<div class="booking-day-grid">' +
            renderDayCheckbox('1', 'Mon', true) +
            renderDayCheckbox('2', 'Tue', true) +
            renderDayCheckbox('3', 'Wed', true) +
            renderDayCheckbox('4', 'Thu', true) +
            renderDayCheckbox('5', 'Fri', true) +
            '</div>' +
            '</fieldset>' +
            '<fieldset class="booking-prefs-section">' +
            '<legend>Time of day</legend>' +
            '<label class="booking-radio"><input type="radio" name="tod" value="any" checked> Either</label>' +
            '<label class="booking-radio"><input type="radio" name="tod" value="morning"> Morning (before 12pm)</label>' +
            '<label class="booking-radio"><input type="radio" name="tod" value="afternoon"> Afternoon (12pm onwards)</label>' +
            '</fieldset>' +
            '<button type="submit" class="btn btn-primary">Find available times</button>' +
            '</form>' +
            '<div id="booking-slots-container"></div>';

        $('booking-prefs-form').addEventListener('submit', function (e) {
            e.preventDefault();
            loadBookingSlots(app);
        });
    }

    function renderDayCheckbox(value, label, checked) {
        return '<label class="booking-day"><input type="checkbox" name="day" value="' +
            value + '"' + (checked ? ' checked' : '') + '> ' + label + '</label>';
    }

    function loadBookingSlots(app) {
        var form = $('booking-prefs-form');
        var days = Array.from(form.querySelectorAll('input[name="day"]:checked'))
            .map(function (el) { return el.value; }).join(',');
        var tod = form.querySelector('input[name="tod"]:checked').value;

        var container = $('booking-slots-container');
        container.innerHTML = '<p class="placeholder">Finding times...</p>';

        if (!days) {
            container.innerHTML = '<p class="booking-error">Please select at least one day.</p>';
            return;
        }

        api('/api/v1/interview/' + app.id + '/slots?days=' + days + '&time_of_day=' + tod)
            .then(function (data) {
                if (!data.slots || data.slots.length === 0) {
                    container.innerHTML =
                        '<p class="booking-error">No times match those preferences. ' +
                        'Try selecting more days or a different time of day.</p>';
                    return;
                }

                // Show times in the student's local timezone, with a note
                // about the company's business hours in Perth
                var tzNote;
                if (isLocalTzPerth()) {
                    tzNote = 'Times shown in ' + escapeHtml(data.timezone) +
                        ' (' + escapeHtml(data.business_hours) + ')';
                } else {
                    tzNote = 'Times shown in your timezone (' +
                        escapeHtml(state.timezone) + '). Business hours are ' +
                        escapeHtml(data.business_hours) + ' Perth time.';
                }

                var html =
                    '<h3>Available times</h3>' +
                    '<p class="booking-tz">' + tzNote + '</p>' +
                    '<div class="booking-slot-list">';
                data.slots.forEach(function (slot) {
                    var display = formatInTimezone(slot.scheduled_at, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                    });
                    html += '<button class="booking-slot-btn" data-slot="' +
                        escapeHtml(slot.scheduled_at) + '">' +
                        escapeHtml(display) + '</button>';
                });
                html += '</div>';
                container.innerHTML = html;
                container.querySelectorAll('.booking-slot-btn').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        confirmBooking(app, btn.getAttribute('data-slot'));
                    });
                });
            })
            .catch(function () {
                container.innerHTML = '<p class="booking-error">Failed to load times. Try again.</p>';
            });
    }

    function confirmBooking(app, scheduledAt) {
        // Disable all slot buttons during the request
        document.querySelectorAll('.booking-slot-btn').forEach(function (b) {
            b.disabled = true;
        });
        fetch(CONFIG.API_BASE + '/api/v1/interview/' + app.id + '/book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scheduled_at: scheduledAt }),
        })
            .then(function (r) {
                if (!r.ok) throw new Error('Booking failed');
                return r.json();
            })
            .then(function () {
                loadStudentState();
                loadInterview();  // re-render with the new booking
            })
            .catch(function (err) {
                alert('Failed to book: ' + err.message);
                document.querySelectorAll('.booking-slot-btn').forEach(function (b) {
                    b.disabled = false;
                });
            });
    }

    function renderBookingScheduled(app, booking) {
        els.interviewPre.classList.remove('hidden');
        els.interviewChat.classList.add('hidden');
        els.interviewResult.classList.add('hidden');

        var nice = formatInTimezone(booking.booking.scheduled_at);
        var tzHint = isLocalTzPerth()
            ? ''
            : '<div class="booking-tz-note">Times shown in your timezone (' +
              escapeHtml(state.timezone) + '). Business hours are in ' +
              'Perth (Australia/Perth).</div>';

        var practiceUrl = CONFIG.API_BASE + '/api/v1/jobs/' +
            encodeURIComponent(app.company_slug) + '/' +
            encodeURIComponent(app.job_slug) + '/practice-script';
        var icsUrl = CONFIG.API_BASE + '/api/v1/interview/' + app.id + '/booking.ics';

        // Reschedule info
        var rescheduleSection = '';
        if (booking.can_reschedule) {
            var remaining = booking.max_reschedules - booking.reschedule_count;
            var remainingText = booking.max_reschedules > 0
                ? ' (' + remaining + ' remaining)'
                : '';
            rescheduleSection =
                '<button id="booking-cancel-btn" class="btn btn-secondary">' +
                'Reschedule' + remainingText + '</button>';
        } else {
            rescheduleSection =
                '<div class="booking-final-note">' +
                '&#128274; This booking is final — you have used all your ' +
                'reschedules for this interview.' +
                '</div>';
        }

        els.interviewPre.innerHTML =
            '<h2>Your interview is scheduled</h2>' +
            '<div class="booking-confirmed">' +
            '<div class="booking-when">&#128197; ' + escapeHtml(nice) + '</div>' +
            '<div class="booking-with">with ' +
            escapeHtml(state.student.active_application.job_title) + ' hiring manager at ' +
            escapeHtml(companyName(app.company_slug)) + '</div>' +
            '</div>' +
            tzHint +
            '<p>Please log back in a few minutes before your scheduled time and ' +
            'click <strong>Begin Interview</strong> from this page. Arriving more ' +
            'than 5 minutes late will forfeit the slot.</p>' +
            '<p>You can use the time before your interview to practise — download ' +
            'a practice script and rehearse with Talk Buddy or any AI chat tool.</p>' +
            '<div class="action-buttons">' +
            '<a href="' + practiceUrl + '" download class="btn btn-primary">' +
            '&#128221; Download practice script</a>' +
            '<a href="' + icsUrl + '" download class="btn btn-secondary">' +
            '&#128197; Add to calendar</a>' +
            rescheduleSection +
            '</div>';

        var cancelBtn = $('booking-cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function () {
                if (!confirm('Cancel your appointment and pick a new time? This will use one of your reschedules.')) return;
                fetch(CONFIG.API_BASE + '/api/v1/interview/' + app.id + '/cancel-booking', {
                    method: 'POST',
                })
                    .then(function (r) {
                        if (!r.ok) {
                            return r.json().then(function (j) {
                                throw new Error(j.detail || 'Reschedule failed');
                            });
                        }
                        return r.json();
                    })
                    .then(function () { loadInterview(); })
                    .catch(function (err) {
                        alert(err.message);
                    });
            });
        }
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
        var talkBuddyUrl = CONFIG.API_BASE + '/api/v1/practice/interview/' +
            app.id + '/talk-buddy.json';
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
            '<a href="' + talkBuddyUrl + '" download class="btn btn-secondary">' +
            '&#127908; Practice in Talk Buddy</a>' +
            '</div>' +
            '<p class="practice-blurb">Want to rehearse first? Download a ' +
            '<a href="' + talkBuddyUrl + '" download>Talk Buddy scenario</a> ' +
            'to practise against the same hiring manager persona, or grab the ' +
            '<a href="' + practiceUrl + '" download>plain practice script</a> ' +
            'for any other AI chat tool. You\'ll get the same kinds of questions ' +
            'in the real interview, but the conversation will go differently.</p>';
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

    // --- Lunchroom (Stage 5a invitation + 5b chat) ---

    var lunchroomState = {
        sessions: [],
        activeSessionId: null,  // session currently rendered in chat mode
        pollTimer: null,
        lastPostCount: 0,
        composing: '',
    };

    function loadLunchroom() {
        var s = state.student;
        var body = $('lunchroom-body');
        if (!body) return;
        if (!s || !s.active_application) {
            body.innerHTML =
                '<div class="empty-state">' +
                '<p>The lunchroom becomes available once you\'re on placement.</p>' +
                '</div>';
            return;
        }
        var appId = s.active_application.id;
        api('/api/v1/lunchroom/application/' + appId)
            .then(function (data) {
                lunchroomState.sessions = data.sessions || [];
                renderLunchroom();
            })
            .catch(function () {
                body.innerHTML =
                    '<div class="empty-state">' +
                    '<p>Could not load lunchroom sessions.</p>' +
                    '</div>';
            });
    }

    function renderLunchroom() {
        var body = $('lunchroom-body');
        if (!body) return;

        // If a session is currently open in chat mode, render that instead.
        if (lunchroomState.activeSessionId) {
            var active = lunchroomState.sessions.find(function (x) {
                return x.id === lunchroomState.activeSessionId;
            });
            if (active && (active.status === 'active' || active.status === 'completed')) {
                renderLunchroomChat(active);
                return;
            }
            lunchroomState.activeSessionId = null;
        }

        if (!lunchroomState.sessions.length) {
            body.innerHTML =
                '<div class="empty-state lunchroom-empty">' +
                '<div class="lunchroom-empty-icon">&#127869;</div>' +
                '<h3>No lunchroom invitations yet</h3>' +
                '<p>Your colleagues will invite you along to a team lunch after you\'ve settled into the work. Check back later.</p>' +
                '</div>';
            return;
        }

        // Group sessions by status bucket
        var buckets = { open: [], upcoming: [], past: [] };
        lunchroomState.sessions.forEach(function (sess) {
            if (sess.status === 'invited') buckets.open.push(sess);
            else if (sess.status === 'accepted') buckets.upcoming.push(sess);
            else if (sess.status === 'active') buckets.upcoming.push(sess);
            else buckets.past.push(sess);
        });

        var html = '';
        if (buckets.open.length) {
            html += '<section class="lunchroom-section">' +
                '<h3 class="lunchroom-section-title">Open invitations</h3>' +
                buckets.open.map(renderInvitationCard).join('') +
                '</section>';
        }
        if (buckets.upcoming.length) {
            html += '<section class="lunchroom-section">' +
                '<h3 class="lunchroom-section-title">Upcoming &amp; active</h3>' +
                buckets.upcoming.map(renderScheduledCard).join('') +
                '</section>';
        }
        if (buckets.past.length) {
            html += '<section class="lunchroom-section lunchroom-past">' +
                '<h3 class="lunchroom-section-title">Past lunches</h3>' +
                buckets.past.map(renderPastCard).join('') +
                '</section>';
        }

        body.innerHTML = html;
        wireLunchroomButtons();
    }

    function occasionLabel(key) {
        return ({
            routine_lunch: 'Team lunch',
            task_celebration: 'Team lunch — celebrating recent work',
            birthday: 'Team lunch — birthday',
            staff_award: 'Team lunch — staff recognition',
            project_launch: 'Team lunch — project milestone',
            cultural_event: 'Team lunch — cultural event',
        })[key] || 'Team lunch';
    }

    function renderParticipantLine(participants) {
        if (!participants || !participants.length) return '';
        var names = participants.map(function (p) { return escapeHtml(p.name); });
        return '<p class="lunchroom-participants">With: ' + names.join(', ') + '</p>';
    }

    function lunchroomTalkBuddyUrl(sessionId) {
        return CONFIG.API_BASE + '/api/v1/practice/lunchroom/' +
            sessionId + '/talk-buddy.json';
    }

    function renderInvitationCard(sess) {
        var detail = sess.occasion_detail
            ? '<p class="lunchroom-detail">' + escapeHtml(sess.occasion_detail) + '</p>'
            : '';
        var slots = (sess.proposed_slots || []).map(function (slot) {
            return '<button class="btn btn-secondary lunchroom-slot-btn" ' +
                'data-session-id="' + sess.id + '" ' +
                'data-slot="' + escapeHtml(slot.scheduled_at) + '">' +
                escapeHtml(slot.local_display) +
                '</button>';
        }).join('');
        return '<article class="lunchroom-card lunchroom-card-invited">' +
            '<header class="lunchroom-card-header">' +
            '<h4>' + escapeHtml(occasionLabel(sess.occasion)) + '</h4>' +
            '<span class="lunchroom-badge lunchroom-badge-invited">Invitation</span>' +
            '</header>' +
            detail +
            renderParticipantLine(sess.participants) +
            '<p class="lunchroom-prompt">Pick a slot that works for you:</p>' +
            '<div class="lunchroom-slots">' + slots + '</div>' +
            '<div class="lunchroom-card-actions">' +
            '<button class="btn btn-link lunchroom-decline-btn" data-session-id="' + sess.id + '">' +
            'Can\'t make it this time' +
            '</button>' +
            '<a href="' + lunchroomTalkBuddyUrl(sess.id) + '" download ' +
            'class="btn btn-link lunchroom-practice-link">' +
            '&#127908; Practice small talk in Talk Buddy &rarr;' +
            '</a>' +
            '</div>' +
            '</article>';
    }

    function renderScheduledCard(sess) {
        var open = chatEntryOpen(sess);
        var when = sess.scheduled_at
            ? '<p class="lunchroom-when">' + escapeHtml(formatLocalDateTime(sess.scheduled_at)) + '</p>'
            : '';
        var statusLabel = sess.status === 'active' ? 'Chat is live' :
            (open ? 'Ready to join' : 'Upcoming');
        var action = (sess.status === 'active' || open)
            ? '<button class="btn btn-primary btn-cta lunchroom-enter-btn" data-session-id="' + sess.id + '">' +
              (sess.status === 'active' ? 'Rejoin the chat' : 'Enter the lunchroom') +
              '</button>'
            : '<p class="lunchroom-muted">The chat opens around the scheduled time.</p>';
        var practice = sess.status !== 'active'
            ? '<a href="' + lunchroomTalkBuddyUrl(sess.id) + '" download ' +
              'class="btn btn-link lunchroom-practice-link">' +
              '&#127908; Practice small talk in Talk Buddy &rarr;</a>'
            : '';
        return '<article class="lunchroom-card lunchroom-card-scheduled">' +
            '<header class="lunchroom-card-header">' +
            '<h4>' + escapeHtml(occasionLabel(sess.occasion)) + '</h4>' +
            '<span class="lunchroom-badge">' + escapeHtml(statusLabel) + '</span>' +
            '</header>' +
            when +
            renderParticipantLine(sess.participants) +
            '<div class="lunchroom-card-actions">' + action + practice + '</div>' +
            '</article>';
    }

    function renderPastCard(sess) {
        var labelMap = {
            completed: 'Completed',
            declined: 'Declined',
            missed: 'Missed',
            cancelled: 'Cancelled',
        };
        var when = sess.scheduled_at
            ? '<p class="lunchroom-when lunchroom-muted">' +
              escapeHtml(formatLocalDateTime(sess.scheduled_at)) +
              '</p>'
            : '';
        var canReopen = sess.status === 'completed';
        var action = canReopen
            ? '<button class="btn btn-link lunchroom-enter-btn" data-session-id="' + sess.id + '">' +
              'View transcript' +
              '</button>'
            : '';
        return '<article class="lunchroom-card lunchroom-card-past">' +
            '<header class="lunchroom-card-header">' +
            '<h4>' + escapeHtml(occasionLabel(sess.occasion)) + '</h4>' +
            '<span class="lunchroom-badge lunchroom-badge-muted">' +
            escapeHtml(labelMap[sess.status] || sess.status) + '</span>' +
            '</header>' +
            when +
            renderParticipantLine(sess.participants) +
            (action ? '<div class="lunchroom-card-actions">' + action + '</div>' : '') +
            '</article>';
    }

    function chatEntryOpen(sess) {
        // Mirrors backend _chat_entry_allowed with sensible defaults for display.
        // Uses a 5-minute early window and 24-hour late window.
        if (!sess.scheduled_at) return false;
        var target = new Date(sess.scheduled_at).getTime();
        if (isNaN(target)) return false;
        var now = Date.now();
        return (target - 5 * 60 * 1000) <= now && now <= (target + 24 * 3600 * 1000);
    }

    function formatLocalDateTime(iso) {
        try {
            return new Date(iso).toLocaleString('en-AU', {
                weekday: 'short', day: 'numeric', month: 'short',
                hour: 'numeric', minute: '2-digit',
            });
        } catch (e) { return iso; }
    }

    function wireLunchroomButtons() {
        document.querySelectorAll('.lunchroom-slot-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = parseInt(btn.getAttribute('data-session-id'), 10);
                var slot = btn.getAttribute('data-slot');
                pickLunchroomSlot(id, slot);
            });
        });
        document.querySelectorAll('.lunchroom-decline-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = parseInt(btn.getAttribute('data-session-id'), 10);
                declineLunchroomInvitation(id);
            });
        });
        document.querySelectorAll('.lunchroom-enter-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = parseInt(btn.getAttribute('data-session-id'), 10);
                enterLunchroomChat(id);
            });
        });
    }

    function pickLunchroomSlot(sessionId, slotIso) {
        fetch(CONFIG.API_BASE + '/api/v1/lunchroom/invitation/' + sessionId + '/pick-slot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scheduled_at: slotIso }),
        })
            .then(function (r) { return r.json(); })
            .then(function () { loadLunchroom(); })
            .catch(function () { alert('Could not pick that slot — please try again.'); });
    }

    function declineLunchroomInvitation(sessionId) {
        fetch(CONFIG.API_BASE + '/api/v1/lunchroom/invitation/' + sessionId + '/decline', {
            method: 'POST',
        })
            .then(function (r) { return r.json(); })
            .then(function () { loadLunchroom(); })
            .catch(function () { alert('Could not decline — please try again.'); });
    }

    function enterLunchroomChat(sessionId) {
        lunchroomState.activeSessionId = sessionId;
        lunchroomState.lastPostCount = 0;

        fetch(CONFIG.API_BASE + '/api/v1/lunchroom/session/' + sessionId + '/activate', {
            method: 'POST',
        })
            .then(function (r) {
                if (!r.ok) {
                    return r.json().then(function (e) {
                        throw new Error(e.detail || 'Could not enter the lunchroom');
                    });
                }
                return r.json();
            })
            .then(function (chatState) {
                // Replace session in local cache with updated status
                var idx = lunchroomState.sessions.findIndex(function (x) {
                    return x.id === sessionId;
                });
                if (idx >= 0) lunchroomState.sessions[idx].status = chatState.status;
                renderLunchroomChat(lunchroomState.sessions[idx], chatState);
                startLunchroomPoll(sessionId);
            })
            .catch(function (err) {
                lunchroomState.activeSessionId = null;
                alert(err.message || 'Could not enter the lunchroom.');
            });
    }

    function renderLunchroomChat(sess, initialState) {
        var body = $('lunchroom-body');
        if (!body) return;
        var participantChips = (sess.participants || []).map(function (p) {
            return '<span class="lunchroom-chip" style="background:' +
                colorForSlug(p.slug) + '">' +
                escapeHtml(p.name) + '</span>';
        }).join('');
        var completed = sess.status === 'completed';
        var composer = completed
            ? '<div class="lunchroom-composer-closed">The lunch has wrapped up.</div>'
            : '<form class="lunchroom-composer" id="lunchroom-composer">' +
              '<textarea id="lunchroom-input" rows="2" placeholder="Say something to the table…" maxlength="1000"></textarea>' +
              '<button type="submit" class="btn btn-primary">Send</button>' +
              '</form>';
        body.innerHTML =
            '<div class="lunchroom-room">' +
            '<header class="lunchroom-room-header">' +
            '<button class="btn btn-link lunchroom-back-btn" id="lunchroom-back-btn">&larr; Back to lunchroom</button>' +
            '<div class="lunchroom-room-title">' +
            '<h3>' + escapeHtml(occasionLabel(sess.occasion)) + '</h3>' +
            '<div class="lunchroom-chips">' + participantChips + '</div>' +
            '</div>' +
            '<div class="lunchroom-room-status" id="lunchroom-status">' +
            (completed ? 'Completed' : '<span class="live-dot"></span> Live') +
            '</div>' +
            '</header>' +
            '<div class="lunchroom-messages" id="lunchroom-messages"></div>' +
            '<div class="lunchroom-wind-down hidden" id="lunchroom-wind-down">' +
            'The lunch is winding down…' +
            '</div>' +
            composer +
            '</div>';

        $('lunchroom-back-btn').addEventListener('click', function () {
            stopLunchroomPoll();
            lunchroomState.activeSessionId = null;
            loadLunchroom();
        });
        var form = $('lunchroom-composer');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                sendLunchroomMessage();
            });
        }
        if (initialState) applyChatState(initialState);
    }

    function applyChatState(chatState) {
        var msgs = $('lunchroom-messages');
        if (!msgs) return;
        var posts = chatState.posts || [];
        var prevCount = lunchroomState.lastPostCount;
        lunchroomState.lastPostCount = posts.length;

        msgs.innerHTML = posts.map(function (p) {
            var isStudent = p.author_kind === 'student';
            var cls = 'lunchroom-msg' + (isStudent ? ' lunchroom-msg-student' : '');
            var style = isStudent
                ? ''
                : ' style="--author-color:' + colorForSlug(p.author_slug || '') + '"';
            var name = isStudent ? 'You' : (p.author_name || 'Colleague');
            return '<div class="' + cls + '"' + style + '>' +
                '<div class="lunchroom-msg-author">' + escapeHtml(name) + '</div>' +
                '<div class="lunchroom-msg-bubble">' + escapeHtml(p.content || '') + '</div>' +
                '</div>';
        }).join('');

        if (posts.length > prevCount) {
            msgs.scrollTop = msgs.scrollHeight;
        }

        var winddown = $('lunchroom-wind-down');
        if (winddown && chatState.soft_cap) {
            toggle(winddown, chatState.delivered_count >= chatState.soft_cap &&
                chatState.status === 'active');
        }

        if (chatState.status === 'completed') {
            var statusEl = $('lunchroom-status');
            if (statusEl) statusEl.innerHTML = 'Completed';
            var form = $('lunchroom-composer');
            if (form) {
                form.outerHTML =
                    '<div class="lunchroom-composer-closed">The lunch has wrapped up.</div>';
            }
            stopLunchroomPoll();
            // Refresh local session status so Back button shows it in "past"
            var sess = lunchroomState.sessions.find(function (x) {
                return x.id === lunchroomState.activeSessionId;
            });
            if (sess) sess.status = 'completed';
        }
    }

    function startLunchroomPoll(sessionId) {
        stopLunchroomPoll();
        lunchroomState.pollTimer = setInterval(function () {
            if (lunchroomState.activeSessionId !== sessionId) {
                stopLunchroomPoll();
                return;
            }
            fetch(CONFIG.API_BASE + '/api/v1/lunchroom/session/' + sessionId + '/chat')
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (chatState) {
                    if (chatState) applyChatState(chatState);
                })
                .catch(function () { /* swallow — retry next tick */ });
        }, 3000);
    }

    function stopLunchroomPoll() {
        if (lunchroomState.pollTimer) {
            clearInterval(lunchroomState.pollTimer);
            lunchroomState.pollTimer = null;
        }
    }

    function sendLunchroomMessage() {
        var input = $('lunchroom-input');
        if (!input) return;
        var text = input.value.trim();
        if (!text) return;
        var sessionId = lunchroomState.activeSessionId;
        if (!sessionId) return;

        input.value = '';
        input.disabled = true;

        fetch(CONFIG.API_BASE + '/api/v1/lunchroom/session/' + sessionId + '/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: text }),
        })
            .then(function (r) {
                if (!r.ok) throw new Error('post failed');
                return r.json();
            })
            .then(function (chatState) {
                applyChatState(chatState);
            })
            .catch(function () {
                input.value = text;
            })
            .finally(function () {
                input.disabled = false;
                input.focus();
            });
    }

    function colorForSlug(slug) {
        // Stable hash → HSL. Keeps colours warm and distinct.
        if (!slug) return '#8b9a8f';
        var h = 0;
        for (var i = 0; i < slug.length; i++) {
            h = (h * 31 + slug.charCodeAt(i)) | 0;
        }
        var hue = Math.abs(h) % 360;
        return 'hsl(' + hue + ', 55%, 55%)';
    }

    // --- Stage 6: Exit interview ---

    var exitState = { session: null };

    function loadExitInterview() {
        var s = state.student;
        var pre = $('exit-pre');
        var chat = $('exit-chat');
        var result = $('exit-result');
        if (!pre || !chat || !result) return;

        if (!s || !s.active_application) {
            pre.classList.remove('hidden');
            chat.classList.add('hidden');
            result.classList.add('hidden');
            pre.innerHTML = '<div class="placeholder">No active placement.</div>';
            return;
        }
        var app = s.active_application;

        // Look up any existing exit interview for this application
        api('/api/v1/exit/application/' + app.id)
            .then(function (session) {
                exitState.session = session;
                if (session.status === 'completed') {
                    showExitResult(session);
                } else {
                    showExitChat(session);
                }
            })
            .catch(function () {
                // No session yet — show the pre-screen with a Start button
                renderExitPre(app);
            });
    }

    function renderExitPre(app) {
        var pre = $('exit-pre');
        var chat = $('exit-chat');
        var result = $('exit-result');
        pre.classList.remove('hidden');
        chat.classList.add('hidden');
        result.classList.add('hidden');
        pre.innerHTML =
            '<h2>Exit conversation</h2>' +
            '<p>You\'ve finished your placement at <strong>' +
            escapeHtml(companyName(app.company_slug)) + '</strong>. ' +
            'Before we close out the program, <strong>Sam Reilly</strong> ' +
            'from People &amp; Culture would like to sit down with you for ' +
            'a short reflective conversation.</p>' +
            '<p>This is <em>not an evaluation</em>. Sam wasn\'t the one ' +
            'grading your tasks — they\'re here to help you think back on ' +
            'what you learned, what you\'d do differently, and to hear any ' +
            'feedback you have for the team. Be honest. Take your time.</p>' +
            '<p>The conversation should take about 10 minutes (~8 questions).</p>' +
            '<div class="action-buttons">' +
            '<button id="exit-begin-btn" class="btn btn-primary btn-cta">' +
            'Start the conversation</button>' +
            '</div>';
        $('exit-begin-btn').addEventListener('click', function () {
            startExitInterview(app);
        });
    }

    function startExitInterview(app) {
        var btn = $('exit-begin-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Connecting...';
        }
        fetch(CONFIG.API_BASE + '/api/v1/exit/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ application_id: app.id }),
        })
            .then(function (r) {
                if (!r.ok) {
                    return r.json().then(function (e) {
                        throw new Error(e.detail || 'Could not start');
                    });
                }
                return r.json();
            })
            .then(function (session) {
                exitState.session = session;
                showExitChat(session);
            })
            .catch(function (err) {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Start the conversation';
                }
                alert('Could not start: ' + err.message);
            });
    }

    function showExitChat(session) {
        $('exit-pre').classList.add('hidden');
        $('exit-chat').classList.remove('hidden');
        $('exit-result').classList.add('hidden');

        $('exit-manager-name').textContent = session.manager_name;
        $('exit-manager-role').textContent = session.manager_role
            ? session.manager_role + ' at ' + session.company_name
            : session.company_name;

        renderExitTranscript(session.transcript);
        updateExitTurnIndicator(session.turn, session.target_turns);

        var input = $('exit-input');
        if (input) {
            input.value = '';
            input.focus();
        }
    }

    function renderExitTranscript(messages) {
        var msgs = $('exit-messages');
        if (!msgs) return;
        var html = '';
        (messages || []).forEach(function (m) {
            var who = m.role === 'assistant' ? 'manager' : 'student';
            html += '<div class="interview-msg interview-msg-' + who + '">' +
                '<div class="interview-msg-bubble">' +
                escapeHtml(m.content).replace(/\n/g, '<br>') +
                '</div></div>';
        });
        msgs.innerHTML = html;
        msgs.scrollTop = msgs.scrollHeight;
    }

    function appendExitMessage(role, content) {
        var msgs = $('exit-messages');
        if (!msgs) return;
        var who = role === 'assistant' ? 'manager' : 'student';
        var div = document.createElement('div');
        div.className = 'interview-msg interview-msg-' + who;
        div.innerHTML = '<div class="interview-msg-bubble">' +
            escapeHtml(content).replace(/\n/g, '<br>') + '</div>';
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
    }

    function appendExitThinking() {
        var msgs = $('exit-messages');
        if (!msgs) return;
        var div = document.createElement('div');
        div.className = 'interview-msg interview-msg-manager';
        div.id = 'exit-thinking';
        div.innerHTML = '<div class="interview-msg-bubble interview-thinking">' +
            '<span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
    }

    function removeExitThinking() {
        var t = $('exit-thinking');
        if (t) t.remove();
    }

    function updateExitTurnIndicator(turn, target) {
        var el = $('exit-turn-indicator');
        if (!el) return;
        var displayTurn = Math.max(turn, 0);
        el.textContent = 'Question ' + (displayTurn + 1) + ' of ~' + (target || 8);
    }

    function sendExitMessage(e) {
        e.preventDefault();
        if (!exitState.session) return;
        var input = $('exit-input');
        var sendBtn = $('exit-send-btn');
        var msg = (input.value || '').trim();
        if (!msg) return;

        appendExitMessage('user', msg);
        input.value = '';
        sendBtn.disabled = true;
        input.disabled = true;
        appendExitThinking();

        fetch(CONFIG.API_BASE + '/api/v1/exit/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: exitState.session.session_id,
                message: msg,
            }),
        })
            .then(function (r) {
                if (!r.ok) throw new Error('Reply failed');
                return r.json();
            })
            .then(function (reply) {
                removeExitThinking();
                appendExitMessage('assistant', reply.reply);
                updateExitTurnIndicator(reply.turn, exitState.session.target_turns);
                sendBtn.disabled = false;
                input.disabled = false;
                input.focus();
                if (reply.suggested_wrap_up) {
                    var ind = $('exit-turn-indicator');
                    if (ind && ind.textContent.indexOf('wrapping up') === -1) {
                        ind.textContent += ' (wrapping up)';
                    }
                }
            })
            .catch(function (err) {
                removeExitThinking();
                appendExitMessage('assistant',
                    '[Connection error: ' + err.message + '. Try again.]');
                sendBtn.disabled = false;
                input.disabled = false;
            });
    }

    function endExitInterview() {
        if (!exitState.session) return;
        if (!confirm('End the conversation now? You won\'t be able to add more.')) {
            return;
        }
        var endBtn = $('exit-end-btn');
        endBtn.disabled = true;
        endBtn.textContent = 'Closing...';
        appendExitThinking();

        fetch(CONFIG.API_BASE + '/api/v1/exit/' + exitState.session.session_id + '/end', {
            method: 'POST',
        })
            .then(function (r) {
                if (!r.ok) throw new Error('Could not end');
                return r.json();
            })
            .then(function (session) {
                removeExitThinking();
                exitState.session = session;
                showExitResult(session);
                loadStudentState();
            })
            .catch(function (err) {
                removeExitThinking();
                alert('Failed: ' + err.message);
                endBtn.disabled = false;
                endBtn.textContent = 'End conversation';
            });
    }

    function showExitResult(session) {
        $('exit-pre').classList.add('hidden');
        $('exit-chat').classList.add('hidden');
        var result = $('exit-result');
        result.classList.remove('hidden');

        var fb = session.feedback || {};
        var feedback = fb.feedback || {};
        var html =
            '<h2>Internship complete</h2>' +
            '<p class="interview-result-summary">' +
            escapeHtml(fb.summary || '') + '</p>' +
            '<div class="interview-result-score">' +
            'Reflection score: <strong>' + (session.final_score || 0) + '/100</strong>' +
            '</div>' +
            renderFeedbackSection('What you brought to the conversation', feedback.strengths) +
            renderFeedbackSection('Things to keep working on', feedback.gaps) +
            '<div class="action-buttons">' +
            '<button id="exit-back-btn" class="btn btn-primary">Back to dashboard</button>' +
            '</div>';
        result.innerHTML = html;
        var backBtn = $('exit-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', function () {
                switchView('dashboard');
            });
        }
    }

    // Wire form + end button (one-time bind, idempotent)
    var exitForm = $('exit-input-form');
    if (exitForm) exitForm.addEventListener('submit', sendExitMessage);
    var exitEndBtn = $('exit-end-btn');
    if (exitEndBtn) exitEndBtn.addEventListener('click', endExitInterview);

    // --- Mid-placement performance review ---

    var perfState = { session: null };

    function loadPerfReview() {
        var s = state.student;
        var pre = $('perf-pre');
        var chat = $('perf-chat');
        var result = $('perf-result');
        if (!pre || !chat || !result) return;

        if (!s || !s.active_application) {
            pre.classList.remove('hidden');
            chat.classList.add('hidden');
            result.classList.add('hidden');
            pre.innerHTML = '<div class="placeholder">No active placement.</div>';
            return;
        }
        var app = s.active_application;

        api('/api/v1/perf-review/application/' + app.id)
            .then(function (session) {
                perfState.session = session;
                if (session.status === 'completed') {
                    showPerfResult(session);
                } else {
                    showPerfChat(session);
                }
            })
            .catch(function () {
                renderPerfPre(app);
            });
    }

    function renderPerfPre(app) {
        var pre = $('perf-pre');
        var chat = $('perf-chat');
        var result = $('perf-result');
        pre.classList.remove('hidden');
        chat.classList.add('hidden');
        result.classList.add('hidden');
        pre.innerHTML =
            '<h2>Mid-placement check-in</h2>' +
            '<p>Your mentor wants a quick chat now that you\'re a couple ' +
            'of tasks in. This is a <em>coaching</em> conversation, not ' +
            'an evaluation — they\'ll talk you through what\'s working and ' +
            'what to focus on for your next task.</p>' +
            '<p>It\'s short — about 5 turns, maybe 5 minutes. Drop in ' +
            'whenever suits.</p>' +
            '<div class="action-buttons">' +
            '<button id="perf-begin-btn" class="btn btn-primary btn-cta">' +
            'Start the check-in</button>' +
            '</div>';
        $('perf-begin-btn').addEventListener('click', function () {
            startPerfReview(app);
        });
    }

    function startPerfReview(app) {
        var btn = $('perf-begin-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Connecting...';
        }
        fetch(CONFIG.API_BASE + '/api/v1/perf-review/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ application_id: app.id }),
        })
            .then(function (r) {
                if (!r.ok) {
                    return r.json().then(function (e) {
                        throw new Error(e.detail || 'Could not start');
                    });
                }
                return r.json();
            })
            .then(function (session) {
                perfState.session = session;
                showPerfChat(session);
            })
            .catch(function (err) {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Start the check-in';
                }
                alert('Could not start: ' + err.message);
            });
    }

    function showPerfChat(session) {
        $('perf-pre').classList.add('hidden');
        $('perf-chat').classList.remove('hidden');
        $('perf-result').classList.add('hidden');

        $('perf-manager-name').textContent = session.manager_name;
        $('perf-manager-role').textContent = session.manager_role
            ? session.manager_role + ' at ' + session.company_name
            : session.company_name;

        renderPerfTranscript(session.transcript);
        updatePerfTurnIndicator(session.turn, session.target_turns);

        var input = $('perf-input');
        if (input) {
            input.value = '';
            input.focus();
        }
    }

    function renderPerfTranscript(messages) {
        var msgs = $('perf-messages');
        if (!msgs) return;
        var html = '';
        (messages || []).forEach(function (m) {
            var who = m.role === 'assistant' ? 'manager' : 'student';
            html += '<div class="interview-msg interview-msg-' + who + '">' +
                '<div class="interview-msg-bubble">' +
                escapeHtml(m.content).replace(/\n/g, '<br>') +
                '</div></div>';
        });
        msgs.innerHTML = html;
        msgs.scrollTop = msgs.scrollHeight;
    }

    function appendPerfMessage(role, content) {
        var msgs = $('perf-messages');
        if (!msgs) return;
        var who = role === 'assistant' ? 'manager' : 'student';
        var div = document.createElement('div');
        div.className = 'interview-msg interview-msg-' + who;
        div.innerHTML = '<div class="interview-msg-bubble">' +
            escapeHtml(content).replace(/\n/g, '<br>') + '</div>';
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
    }

    function appendPerfThinking() {
        var msgs = $('perf-messages');
        if (!msgs) return;
        var div = document.createElement('div');
        div.className = 'interview-msg interview-msg-manager';
        div.id = 'perf-thinking';
        div.innerHTML = '<div class="interview-msg-bubble interview-thinking">' +
            '<span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
    }

    function removePerfThinking() {
        var t = $('perf-thinking');
        if (t) t.remove();
    }

    function updatePerfTurnIndicator(turn, target) {
        var el = $('perf-turn-indicator');
        if (!el) return;
        el.textContent = 'Turn ' + (Math.max(turn, 0) + 1) + ' of ~' + (target || 5);
    }

    function sendPerfMessage(e) {
        e.preventDefault();
        if (!perfState.session) return;
        var input = $('perf-input');
        var sendBtn = $('perf-send-btn');
        var msg = (input.value || '').trim();
        if (!msg) return;

        appendPerfMessage('user', msg);
        input.value = '';
        sendBtn.disabled = true;
        input.disabled = true;
        appendPerfThinking();

        fetch(CONFIG.API_BASE + '/api/v1/perf-review/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: perfState.session.session_id,
                message: msg,
            }),
        })
            .then(function (r) { if (!r.ok) throw new Error('Reply failed'); return r.json(); })
            .then(function (reply) {
                removePerfThinking();
                appendPerfMessage('assistant', reply.reply);
                updatePerfTurnIndicator(reply.turn, perfState.session.target_turns);
                sendBtn.disabled = false;
                input.disabled = false;
                input.focus();
                if (reply.suggested_wrap_up) {
                    var ind = $('perf-turn-indicator');
                    if (ind && ind.textContent.indexOf('wrapping up') === -1) {
                        ind.textContent += ' (wrapping up)';
                    }
                }
            })
            .catch(function (err) {
                removePerfThinking();
                appendPerfMessage('assistant', '[Connection error: ' + err.message + '. Try again.]');
                sendBtn.disabled = false;
                input.disabled = false;
            });
    }

    function endPerfReview() {
        if (!perfState.session) return;
        if (!confirm('End the check-in now?')) return;
        var endBtn = $('perf-end-btn');
        endBtn.disabled = true;
        endBtn.textContent = 'Closing...';
        appendPerfThinking();

        fetch(CONFIG.API_BASE + '/api/v1/perf-review/' + perfState.session.session_id + '/end', {
            method: 'POST',
        })
            .then(function (r) { if (!r.ok) throw new Error('Could not end'); return r.json(); })
            .then(function (session) {
                removePerfThinking();
                perfState.session = session;
                showPerfResult(session);
            })
            .catch(function (err) {
                removePerfThinking();
                alert('Failed: ' + err.message);
                endBtn.disabled = false;
                endBtn.textContent = 'End check-in';
            });
    }

    function showPerfResult(session) {
        $('perf-pre').classList.add('hidden');
        $('perf-chat').classList.add('hidden');
        var result = $('perf-result');
        result.classList.remove('hidden');

        var fb = session.feedback || {};
        var keyFocus = fb.key_focus || '';
        var html =
            '<h2>Check-in done</h2>' +
            '<p class="interview-result-summary">' +
            'Thanks for taking the time. Carry the conversation into your ' +
            'next task and see how it lands.</p>';
        if (keyFocus && keyFocus.indexOf('(') !== 0) {
            html += '<div class="interview-result-score">Focus for task 3: <strong>' +
                escapeHtml(keyFocus) + '</strong></div>';
        }
        html += '<div class="action-buttons">' +
            '<button id="perf-back-btn" class="btn btn-primary">Back to dashboard</button>' +
            '</div>';
        result.innerHTML = html;
        var back = $('perf-back-btn');
        if (back) back.addEventListener('click', function () { switchView('dashboard'); });
    }

    var perfForm = $('perf-input-form');
    if (perfForm) perfForm.addEventListener('submit', sendPerfMessage);
    var perfEndBtn = $('perf-end-btn');
    if (perfEndBtn) perfEndBtn.addEventListener('click', endPerfReview);

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

    // --- Mail system: compose, reply, delete, sent box ---

    var composeModal = $('compose-modal');
    var composeForm = $('compose-form');
    var composeTo = $('compose-to');
    var composeSubject = $('compose-subject');
    var composeBody = $('compose-body');
    var composeAttachment = $('compose-attachment');
    var composeResult = $('compose-result');
    var composeSendBtn = $('compose-send-btn');
    var composeClose = $('compose-close');
    var composeCancelBtn = $('compose-cancel-btn');
    var composeTitle = $('compose-title');
    var emailDirectory = $('email-directory');
    var sentList = $('sent-list');
    var modalReplyBtn = $('modal-reply-btn');
    var modalDeleteBtn = $('modal-delete-btn');
    var modalSenderEmail = $('modal-sender-email');
    var modalActions = $('modal-actions');

    var mailState = {
        replyToId: null,
        currentMessage: null,
        directoryLoaded: false,
    };

    // Compose buttons (on all inbox/sent views)
    ['compose-btn-personal', 'compose-btn-work', 'compose-btn-sent', 'compose-btn-sent-work'].forEach(function (id) {
        var btn = $(id);
        if (btn) btn.addEventListener('click', function () { openCompose(); });
    });

    function openCompose(prefillTo, prefillSubject, replyToId) {
        mailState.replyToId = replyToId || null;
        composeTitle.textContent = replyToId ? 'Reply' : 'New message';
        composeTo.value = prefillTo || '';
        composeSubject.value = prefillSubject || '';
        composeBody.value = '';
        composeAttachment.value = '';
        composeResult.classList.add('hidden');
        composeTo.readOnly = !!replyToId;
        composeSubject.readOnly = !!replyToId;
        composeSendBtn.textContent = replyToId ? 'Send reply →' : 'Send →';
        composeModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        loadEmailDirectory();
        if (!replyToId) composeTo.focus();
        else composeBody.focus();
    }

    function closeCompose() {
        composeModal.classList.add('hidden');
        document.body.style.overflow = '';
        mailState.replyToId = null;
    }

    composeClose.addEventListener('click', closeCompose);
    composeCancelBtn.addEventListener('click', closeCompose);
    composeModal.addEventListener('click', function (e) {
        if (e.target === composeModal) closeCompose();
    });

    // Email directory for autocomplete
    function loadEmailDirectory() {
        if (mailState.directoryLoaded) return;
        api('/api/v1/mail/directory')
            .then(function (data) {
                var html = '';
                (data.addresses || []).forEach(function (a) {
                    var label = a.email;
                    if (a.name) label = a.name + ' (' + a.email + ')';
                    html += '<option value="' + escapeHtml(a.email) + '">' + escapeHtml(label) + '</option>';
                });
                emailDirectory.innerHTML = html;
                mailState.directoryLoaded = true;
            })
            .catch(function () {}); // silent — autocomplete is a nicety
    }

    // Send / compose form submission
    composeForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData();
        fd.append('student_email', state.email);
        fd.append('recipient_email', composeTo.value.trim());
        fd.append('subject', composeSubject.value.trim());
        fd.append('body', composeBody.value);
        if (composeAttachment.files[0]) {
            fd.append('attachment', composeAttachment.files[0]);
        }

        composeSendBtn.disabled = true;
        composeSendBtn.textContent = 'Sending...';
        composeResult.classList.add('hidden');

        var endpoint = mailState.replyToId
            ? '/api/v1/mail/reply/' + mailState.replyToId
            : '/api/v1/mail/compose';

        // For reply, API expects student_email + body (+ optional attachment)
        if (mailState.replyToId) {
            fd.delete('recipient_email');
            fd.delete('subject');
        }

        fetch(CONFIG.API_BASE + endpoint, { method: 'POST', body: fd })
            .then(function (r) {
                if (!r.ok) throw new Error('Send failed: ' + r.status);
                return r.json();
            })
            .then(function (result) {
                if (result.status === 'bounced') {
                    composeResult.className = 'compose-result compose-bounce';
                    var msg = '↩ Message bounced: ' + (result.bounce_reason || 'invalid address');
                    composeResult.textContent = msg;
                } else {
                    composeResult.className = 'compose-result compose-success';
                    composeResult.textContent = '✓ Message sent';
                    setTimeout(function () {
                        closeCompose();
                        // Refresh inbox to show any ack / bounce
                        if (state.currentView === 'inbox-personal') loadInbox('personal');
                        if (state.currentView === 'inbox-work') loadInbox('work');
                        if (state.currentView === 'sent') loadSentBox();
                        loadStudentState();
                    }, 1200);
                }
                composeResult.classList.remove('hidden');
            })
            .catch(function (err) {
                composeResult.className = 'compose-result compose-error';
                composeResult.textContent = 'Failed to send: ' + err.message;
                composeResult.classList.remove('hidden');
            })
            .finally(function () {
                composeSendBtn.disabled = false;
                composeSendBtn.textContent = mailState.replyToId ? 'Send reply →' : 'Send →';
            });
    });

    // Reply button in message modal
    modalReplyBtn.addEventListener('click', function () {
        var msg = mailState.currentMessage;
        if (!msg) return;
        closeModal();
        var replyTo = msg.sender_email || '';
        var subj = msg.subject || '';
        if (!subj.startsWith('Re: ')) subj = 'Re: ' + subj;
        openCompose(replyTo, subj, msg.id);
    });

    // Delete button in message modal
    modalDeleteBtn.addEventListener('click', function () {
        var msg = mailState.currentMessage;
        if (!msg) return;
        if (!confirm('Delete this message?')) return;
        fetch(CONFIG.API_BASE + '/api/v1/mail/message/' + msg.id + '?student_email=' + encodeURIComponent(state.email), {
            method: 'DELETE',
        })
            .then(function (r) {
                if (!r.ok) throw new Error('Delete failed');
                closeModal();
                if (state.currentView === 'inbox-personal') loadInbox('personal');
                if (state.currentView === 'inbox-work') loadInbox('work');
                if (state.currentView === 'sent') loadSentBox();
                loadStudentState();
            })
            .catch(function (err) {
                alert('Could not delete: ' + err.message);
            });
    });

    // Sent box — shared by personal sent and work sent views
    function loadSentBox() {
        var targetList = state.currentView === 'sent-work' ? $('sent-work-list') : sentList;
        if (!targetList) return;
        targetList.innerHTML = '<div class="empty-inbox">Loading...</div>';
        api('/api/v1/mail/sent/' + encodeURIComponent(state.email))
            .then(function (data) {
                if (!data.messages || data.messages.length === 0) {
                    targetList.innerHTML = '<div class="empty-inbox">No sent messages yet. Use the Compose button to send one.</div>';
                    return;
                }
                var html = '';
                data.messages.forEach(function (m) {
                    var statusClass = m.status === 'bounced' ? ' sent-bounced' : ' sent-delivered';
                    var statusIcon = m.status === 'bounced' ? '↩' : '✓';
                    html +=
                        '<div class="message-item sent-item' + statusClass + '">' +
                        '<div class="message-header">' +
                        '<span class="message-sender">To: ' + escapeHtml(m.recipient_email) + '</span>' +
                        '<span class="message-date">' + formatDate(m.created_at) + ' ' + statusIcon + '</span>' +
                        '</div>' +
                        '<div class="message-subject">' + escapeHtml(m.subject) + '</div>' +
                        '<div class="message-preview">' + escapeHtml(m.body.split('\n')[0].substring(0, 80)) + '</div>' +
                        '</div>';
                });
                targetList.innerHTML = html;
            })
            .catch(function () {
                targetList.innerHTML = '<div class="empty-inbox">Could not load sent messages.</div>';
            });
    }

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

    // --- Wire static external links from CONFIG ---
    // These sidebar links don't depend on student state, so we set them
    // once at boot. Keeps config.js as the single source of truth for
    // external URLs — no hardcoded hrefs to drift out of sync.
    // (jobBoardLink gets re-set per-render once we know the student's
    // email, so we can append ?student= for personalised state — see
    // the render loop above. This boot assignment is the pre-signin
    // fallback so the link works even before the student is known.)
    if (els.jobBoardLink && CONFIG.JOBS_URL) {
        els.jobBoardLink.href = CONFIG.JOBS_URL;
    }
    if (els.talkBuddyLink && CONFIG.TALK_BUDDY_URL) {
        els.talkBuddyLink.href = CONFIG.TALK_BUDDY_URL;
    }
    if (els.careerCompassLink && CONFIG.CAREER_COMPASS_URL) {
        els.careerCompassLink.href = CONFIG.CAREER_COMPASS_URL;
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
