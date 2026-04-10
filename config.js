/* WorkReady Portal — configuration */

window.WORKREADY_CONFIG = {
    // API base URL — override this when deploying
    API_BASE: localStorage.getItem('workready_api_base') || 'https://workready-api.eduserver.au',

    // External links
    PRIMER_URL: 'https://primer.eduserver.au/',
    JOBS_URL: 'https://seekjobs.eduserver.au/',
    TALK_BUDDY_URL: 'https://github.com/michael-borck/talk-buddy/releases',

    // Company sites — used to link to the assigned company's intranet
    COMPANY_URLS: {
        'nexuspoint-systems': 'https://nexuspointsystems.eduserver.au/',
        'ironvale-resources': 'https://ironvaleresources.eduserver.au/',
        'meridian-advisory': 'https://meridianadvisory.eduserver.au/',
        'metro-council-wa': 'https://metrocouncilwa.eduserver.au/',
        'southern-cross-financial': 'https://southerncrossfinancial.eduserver.au/',
        'horizon-foundation': 'https://horizonfoundation.eduserver.au/',
    },

    // Company themes — CSS variable overrides applied when hired
    COMPANY_THEMES: {
        'nexuspoint-systems': {
            '--sim-primary': '#4a63e7',
            '--sim-primary-dark': '#3a4fc7',
            '--sim-accent': '#00d4aa',
            '--sim-bg': '#f7f8fb',
        },
        'ironvale-resources': {
            '--sim-primary': '#9B1B30',
            '--sim-primary-dark': '#7A1526',
            '--sim-accent': '#E67E22',
            '--sim-bg': '#F5F0EB',
        },
        'meridian-advisory': {
            '--sim-primary': '#1a365d',
            '--sim-primary-dark': '#0f2340',
            '--sim-accent': '#63b3ed',
            '--sim-bg': '#f7fafc',
        },
        'metro-council-wa': {
            '--sim-primary': '#1B5E3B',
            '--sim-primary-dark': '#134D30',
            '--sim-accent': '#81C784',
            '--sim-bg': '#F4F8F5',
        },
        'southern-cross-financial': {
            '--sim-primary': '#1E293B',
            '--sim-primary-dark': '#0F172A',
            '--sim-accent': '#0EA5E9',
            '--sim-bg': '#F8FAFC',
        },
        'horizon-foundation': {
            '--sim-primary': '#8B4513',
            '--sim-primary-dark': '#6B3410',
            '--sim-accent': '#D2691E',
            '--sim-bg': '#FFF8F0',
        },
    },
};
