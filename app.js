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

    // Compose buttons
    var composeBtnPersonal = $('compose-btn-personal');
    var composeBtnWork = $('compose-btn-work');
    if (composeBtnPersonal) composeBtnPersonal.addEventListener('click', function () { openCompose(); });
    if (composeBtnWork) composeBtnWork.addEventListener('click', function () { openCompose(); });

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

    // Sent box
    function loadSentBox() {
        if (!sentList) return;
        sentList.innerHTML = '<div class="empty-inbox">Loading...</div>';
        api('/api/v1/mail/sent/' + encodeURIComponent(state.email))
            .then(function (data) {
                if (!data.messages || data.messages.length === 0) {
                    sentList.innerHTML = '<div class="empty-inbox">No sent messages yet. Use the Compose button in your inbox to send one.</div>';
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
                sentList.innerHTML = html;
            })
            .catch(function () {
                sentList.innerHTML = '<div class="empty-inbox">Could not load sent messages.</div>';
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
