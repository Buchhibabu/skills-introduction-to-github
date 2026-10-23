// Registers every B-roll shot used by the film (each module calls register() from kit.js).
// A shot that fails to load is reported and left out, so the rest of the film still builds.
const SHOTS = ['server_hall', 'office_screens', 'doors_corridor', 'night_city', 'globe_users', 'startup_field',
  'flywheel_3d', 'feedback_stream', 'code_tunnel', 'rising_chart', 'particle_person', 'neural_bloom',
  'dawn_landscape', 'eye_macro', 'runner_ridge'];
await Promise.all(SHOTS.map((name) => import(`./shots/${name}.js`).catch((e) => console.error(`B-roll shot ${name} not loaded: ${e.message}`))));
