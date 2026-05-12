// Gerenciador leve de tours da Voithos.
(function () {
    'use strict';

    const DRIVER_CSS_ID = 'voithos-driverjs-css';
    const DRIVER_SCRIPT_ID = 'voithos-driverjs-script';
    const DRIVER_CSS_HREF = 'assets/vendor/driverjs/driver.css';
    const DRIVER_SCRIPT_SRC = 'assets/vendor/driverjs/driver.js.iife.js';
    const HOME_COMPLETED_KEY = 'voithos_tutorial_home_completed';

    const tours = {
        home: {
            storageKey: HOME_COMPLETED_KEY,
            steps: [
                {
                    element: '#card-agenda',
                    popover: {
                        title: 'Agenda',
                        description: 'Acompanhe consultas e confirme pacientes rapidamente.',
                        side: 'bottom',
                        align: 'start',
                    },
                },
                {
                    element: '#card-prontuario',
                    popover: {
                        title: 'Pacientes',
                        description: 'Acesse historico, tratamentos e financeiro do paciente.',
                        side: 'bottom',
                        align: 'start',
                    },
                },
                {
                    element: '#card-campanhas',
                    popover: {
                        title: 'Oportunidades',
                        description: 'Pacientes prontos para contato rapido pelo WhatsApp.',
                        side: 'top',
                        align: 'start',
                    },
                },
                {
                    element: '#card-gestao-controle',
                    popover: {
                        title: 'Gestao',
                        description: 'Controle financeiro, estoque e indicadores da clinica.',
                        side: 'bottom',
                        align: 'start',
                    },
                },
            ],
        },
    };

    let driverLoadPromise = null;
    let activeDriver = null;

    const storage = {
        get(key) {
            try {
                return window.localStorage.getItem(key);
            } catch (_) {
                return null;
            }
        },
        set(key, value) {
            try {
                window.localStorage.setItem(key, value);
            } catch (_) {
                // Sem localStorage, o tour continua funcionando apenas na sessao atual.
            }
        },
    };

    const isMobileViewport = () => window.matchMedia('(max-width: 768px)').matches;

    const markCompleted = (tour) => {
        if (!tour?.storageKey) return;
        storage.set(tour.storageKey, 'true');
    };

    const loadStylesheet = () => {
        if (document.getElementById(DRIVER_CSS_ID)) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.id = DRIVER_CSS_ID;
            link.rel = 'stylesheet';
            link.href = DRIVER_CSS_HREF;
            link.onload = resolve;
            link.onerror = reject;
            document.head.appendChild(link);
        });
    };

    const loadScript = () => {
        if (window.driver?.js?.driver) return Promise.resolve();
        if (document.getElementById(DRIVER_SCRIPT_ID)) {
            return new Promise((resolve, reject) => {
                const existing = document.getElementById(DRIVER_SCRIPT_ID);
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', reject, { once: true });
            });
        }
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.id = DRIVER_SCRIPT_ID;
            script.src = DRIVER_SCRIPT_SRC;
            script.defer = true;
            script.onload = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
        });
    };

    const loadDriver = async () => {
        if (!driverLoadPromise) {
            driverLoadPromise = Promise.all([loadStylesheet(), loadScript()]);
        }
        await driverLoadPromise;
        return window.driver?.js?.driver;
    };

    const getVisibleSteps = (steps) => {
        return steps.filter((step) => {
            const element = document.querySelector(step.element);
            if (!element) return false;
            return element.offsetParent !== null;
        });
    };

    const startTour = async (name, options = {}) => {
        const tour = tours[name];
        if (!tour) return false;
        if (!options.force && storage.get(tour.storageKey) === 'true') return false;

        const steps = getVisibleSteps(tour.steps);
        if (!steps.length) return false;

        const driver = await loadDriver();
        if (!driver) return false;

        activeDriver?.destroy?.();
        activeDriver = driver({
            allowClose: true,
            animate: true,
            overlayOpacity: 0.34,
            smoothScroll: true,
            stagePadding: isMobileViewport() ? 8 : 10,
            stageRadius: 14,
            popoverClass: 'voithos-driver-popover',
            showButtons: ['next', 'previous', 'close'],
            nextBtnText: 'Avancar',
            prevBtnText: 'Voltar',
            doneBtnText: 'Concluir',
            progressText: '{{current}} de {{total}}',
            showProgress: true,
            steps,
            onDestroyed: () => {
                markCompleted(tour);
                activeDriver = null;
            },
            onPopoverRender: (popover) => {
                popover.closeButton.setAttribute('aria-label', 'Pular tutorial');
                popover.closeButton.setAttribute('title', 'Pular tutorial');
                if (!popover.footer.querySelector('.voithos-driver-skip-btn')) {
                    const skipButton = document.createElement('button');
                    skipButton.type = 'button';
                    skipButton.className = 'voithos-driver-skip-btn';
                    skipButton.textContent = 'Pular';
                    skipButton.addEventListener('click', () => activeDriver?.destroy?.(), { once: true });
                    popover.footer.insertBefore(skipButton, popover.footerButtons);
                }
            },
        });
        activeDriver.drive();
        return true;
    };

    const scheduleHomeTour = () => {
        const start = () => {
            window.setTimeout(() => {
                void startTour('home');
            }, 700);
        };
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(start, { timeout: 1800 });
            return;
        }
        start();
    };

    const bindTutorialTriggers = () => {
        document.addEventListener('click', (event) => {
            const trigger = event.target?.closest?.('[data-action="tutorial-home"]');
            if (!trigger) return;
            event.preventDefault();
            event.stopPropagation();
            document.getElementById('user-menu-dropdown')?.classList.remove('open');
            document.getElementById('user-menu-toggle')?.setAttribute('aria-expanded', 'false');
            void startTour('home', { force: true });
        });
    };

    window.voithosTutorials = {
        startHome: (options) => startTour('home', options),
        resetHome: () => storage.set(HOME_COMPLETED_KEY, 'false'),
        keys: {
            homeCompleted: HOME_COMPLETED_KEY,
        },
    };

    document.addEventListener('DOMContentLoaded', () => {
        bindTutorialTriggers();
        scheduleHomeTour();
    });
})();
