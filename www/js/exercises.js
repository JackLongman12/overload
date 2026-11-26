// Exercise library.
// type: wr = weight x reps, bw = bodyweight reps, wbw = weighted bodyweight (added load),
//       dur = timed hold/round, dist = distance + time, climb = grade + attempts
// discipline: strength, calisthenics, cardio, mobility, combat, climbing, conditioning
'use strict';

const MUSCLES = {
  chest: 'Chest', lats: 'Lats', upper_back: 'Upper back', traps: 'Traps', shoulders: 'Shoulders',
  biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms', abs: 'Abs', lower_back: 'Lower back',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves', adductors: 'Adductors',
  full_body: 'Full body', cardio: 'Cardio', mobility: 'Mobility'
};

const DISCIPLINES = {
  strength: { name: 'Strength', icon: 'barbell', desc: 'Weights, sets, reps, RPE' },
  calisthenics: { name: 'Calisthenics', icon: 'gymnastics', desc: 'Bodyweight skills and ladders' },
  cardio: { name: 'Cardio', icon: 'run', desc: 'Run, bike, row, swim' },
  conditioning: { name: 'Conditioning', icon: 'flame', desc: 'HIIT, EMOM, Tabata, AMRAP' },
  combat: { name: 'Combat', icon: 'karate', desc: 'Boxing, BJJ, Muay Thai rounds' },
  mobility: { name: 'Mobility and yoga', icon: 'yoga', desc: 'Timed holds and flows' },
  climbing: { name: 'Climbing', icon: 'mountain', desc: 'Boulder and route grades' }
};

// [name, primary muscle, secondary muscles, equipment, type, discipline, compound?]
const RAW_EXERCISES = [
  // Chest
  ['Bench Press (Barbell)', 'chest', 'triceps,shoulders', 'barbell', 'wr', 'strength', 1],
  ['Incline Bench Press (Barbell)', 'chest', 'shoulders,triceps', 'barbell', 'wr', 'strength', 1],
  ['Decline Bench Press (Barbell)', 'chest', 'triceps', 'barbell', 'wr', 'strength', 1],
  ['Bench Press (Dumbbell)', 'chest', 'triceps,shoulders', 'dumbbell', 'wr', 'strength', 1],
  ['Incline Bench Press (Dumbbell)', 'chest', 'shoulders,triceps', 'dumbbell', 'wr', 'strength', 1],
  ['Chest Fly (Dumbbell)', 'chest', '', 'dumbbell', 'wr', 'strength', 0],
  ['Cable Fly Crossovers', 'chest', '', 'cable', 'wr', 'strength', 0],
  ['Chest Press (Machine)', 'chest', 'triceps', 'machine', 'wr', 'strength', 1],
  ['Pec Deck (Machine)', 'chest', '', 'machine', 'wr', 'strength', 0],
  ['Smith Machine Bench Press', 'chest', 'triceps', 'machine', 'wr', 'strength', 1],
  ['Chest Dip', 'chest', 'triceps', 'bodyweight', 'bw', 'calisthenics', 1],
  ['Chest Dip (Weighted)', 'chest', 'triceps', 'bodyweight', 'wbw', 'strength', 1],
  // Back
  ['Deadlift (Barbell)', 'lower_back', 'hamstrings,glutes,traps', 'barbell', 'wr', 'strength', 1],
  ['Bent Over Row (Barbell)', 'upper_back', 'lats,biceps', 'barbell', 'wr', 'strength', 1],
  ['Pendlay Row (Barbell)', 'upper_back', 'lats', 'barbell', 'wr', 'strength', 1],
  ['T Bar Row', 'upper_back', 'lats,biceps', 'barbell', 'wr', 'strength', 1],
  ['Dumbbell Row', 'lats', 'upper_back,biceps', 'dumbbell', 'wr', 'strength', 1],
  ['Seated Cable Row', 'upper_back', 'lats,biceps', 'cable', 'wr', 'strength', 1],
  ['Lat Pulldown (Cable)', 'lats', 'biceps', 'cable', 'wr', 'strength', 1],
  ['Close Grip Lat Pulldown', 'lats', 'biceps', 'cable', 'wr', 'strength', 1],
  ['Straight Arm Pulldown', 'lats', '', 'cable', 'wr', 'strength', 0],
  ['Pull Up (Weighted)', 'lats', 'biceps', 'bodyweight', 'wbw', 'strength', 1],
  ['Chin Up (Weighted)', 'lats', 'biceps', 'bodyweight', 'wbw', 'strength', 1],
  ['Rack Pull', 'lower_back', 'traps,glutes', 'barbell', 'wr', 'strength', 1],
  ['Back Extension', 'lower_back', 'glutes,hamstrings', 'bodyweight', 'bw', 'strength', 0],
  ['Face Pull', 'shoulders', 'upper_back', 'cable', 'wr', 'strength', 0],
  ['Shrug (Barbell)', 'traps', '', 'barbell', 'wr', 'strength', 0],
  ['Shrug (Dumbbell)', 'traps', '', 'dumbbell', 'wr', 'strength', 0],
  // Shoulders
  ['Overhead Press (Barbell)', 'shoulders', 'triceps', 'barbell', 'wr', 'strength', 1],
  ['Seated Shoulder Press (Dumbbell)', 'shoulders', 'triceps', 'dumbbell', 'wr', 'strength', 1],
  ['Arnold Press (Dumbbell)', 'shoulders', 'triceps', 'dumbbell', 'wr', 'strength', 1],
  ['Shoulder Press (Machine)', 'shoulders', 'triceps', 'machine', 'wr', 'strength', 1],
  ['Lateral Raise (Dumbbell)', 'shoulders', '', 'dumbbell', 'wr', 'strength', 0],
  ['Lateral Raise (Cable)', 'shoulders', '', 'cable', 'wr', 'strength', 0],
  ['Rear Delt Fly (Dumbbell)', 'shoulders', 'upper_back', 'dumbbell', 'wr', 'strength', 0],
  ['Reverse Pec Deck', 'shoulders', 'upper_back', 'machine', 'wr', 'strength', 0],
  ['Front Raise (Dumbbell)', 'shoulders', '', 'dumbbell', 'wr', 'strength', 0],
  ['Upright Row (Barbell)', 'shoulders', 'traps', 'barbell', 'wr', 'strength', 0],
  ['Push Press', 'shoulders', 'triceps,quads', 'barbell', 'wr', 'strength', 1],
  // Arms
  ['Bicep Curl (Barbell)', 'biceps', 'forearms', 'barbell', 'wr', 'strength', 0],
  ['Bicep Curl (Dumbbell)', 'biceps', 'forearms', 'dumbbell', 'wr', 'strength', 0],
  ['Hammer Curl (Dumbbell)', 'biceps', 'forearms', 'dumbbell', 'wr', 'strength', 0],
  ['Preacher Curl (EZ Bar)', 'biceps', '', 'barbell', 'wr', 'strength', 0],
  ['Incline Curl (Dumbbell)', 'biceps', '', 'dumbbell', 'wr', 'strength', 0],
  ['Bicep Curl (Cable)', 'biceps', '', 'cable', 'wr', 'strength', 0],
  ['Triceps Pushdown (Cable)', 'triceps', '', 'cable', 'wr', 'strength', 0],
  ['Overhead Triceps Extension (Cable)', 'triceps', '', 'cable', 'wr', 'strength', 0],
  ['Skullcrusher (EZ Bar)', 'triceps', '', 'barbell', 'wr', 'strength', 0],
  ['Close Grip Bench Press', 'triceps', 'chest', 'barbell', 'wr', 'strength', 1],
  ['Triceps Dip', 'triceps', 'chest', 'bodyweight', 'bw', 'calisthenics', 1],
  ['Wrist Curl (Dumbbell)', 'forearms', '', 'dumbbell', 'wr', 'strength', 0],
  ['Farmers Walk', 'forearms', 'traps,full_body', 'dumbbell', 'wr', 'strength', 1],
  // Legs
  ['Squat (Barbell)', 'quads', 'glutes,hamstrings', 'barbell', 'wr', 'strength', 1],
  ['Front Squat (Barbell)', 'quads', 'glutes,abs', 'barbell', 'wr', 'strength', 1],
  ['Goblet Squat', 'quads', 'glutes', 'dumbbell', 'wr', 'strength', 1],
  ['Hack Squat (Machine)', 'quads', 'glutes', 'machine', 'wr', 'strength', 1],
  ['Leg Press (Machine)', 'quads', 'glutes', 'machine', 'wr', 'strength', 1],
  ['Bulgarian Split Squat', 'quads', 'glutes', 'dumbbell', 'wr', 'strength', 1],
  ['Walking Lunge (Dumbbell)', 'quads', 'glutes', 'dumbbell', 'wr', 'strength', 1],
  ['Leg Extension (Machine)', 'quads', '', 'machine', 'wr', 'strength', 0],
  ['Romanian Deadlift (Barbell)', 'hamstrings', 'glutes,lower_back', 'barbell', 'wr', 'strength', 1],
  ['Romanian Deadlift (Dumbbell)', 'hamstrings', 'glutes', 'dumbbell', 'wr', 'strength', 1],
  ['Lying Leg Curl (Machine)', 'hamstrings', '', 'machine', 'wr', 'strength', 0],
  ['Seated Leg Curl (Machine)', 'hamstrings', '', 'machine', 'wr', 'strength', 0],
  ['Nordic Hamstring Curl', 'hamstrings', '', 'bodyweight', 'bw', 'calisthenics', 0],
  ['Hip Thrust (Barbell)', 'glutes', 'hamstrings', 'barbell', 'wr', 'strength', 1],
  ['Glute Bridge', 'glutes', 'hamstrings', 'bodyweight', 'bw', 'strength', 0],
  ['Cable Kickback', 'glutes', '', 'cable', 'wr', 'strength', 0],
  ['Hip Abduction (Machine)', 'glutes', '', 'machine', 'wr', 'strength', 0],
  ['Hip Adduction (Machine)', 'adductors', '', 'machine', 'wr', 'strength', 0],
  ['Sumo Deadlift', 'glutes', 'hamstrings,quads,adductors', 'barbell', 'wr', 'strength', 1],
  ['Standing Calf Raise (Machine)', 'calves', '', 'machine', 'wr', 'strength', 0],
  ['Seated Calf Raise', 'calves', '', 'machine', 'wr', 'strength', 0],
  // Core
  ['Cable Crunch', 'abs', '', 'cable', 'wr', 'strength', 0],
  ['Crunch', 'abs', '', 'bodyweight', 'bw', 'strength', 0],
  ['Hanging Leg Raise', 'abs', '', 'bodyweight', 'bw', 'calisthenics', 0],
  ['Ab Wheel Rollout', 'abs', '', 'other', 'bw', 'strength', 0],
  ['Russian Twist', 'abs', '', 'bodyweight', 'bw', 'strength', 0],
  ['Pallof Press', 'abs', '', 'cable', 'wr', 'strength', 0],
  ['Plank', 'abs', '', 'bodyweight', 'dur', 'calisthenics', 0],
  ['Side Plank', 'abs', '', 'bodyweight', 'dur', 'calisthenics', 0],
  // Olympic / power
  ['Power Clean', 'full_body', 'traps,quads,glutes', 'barbell', 'wr', 'strength', 1],
  ['Clean and Jerk', 'full_body', 'shoulders,quads', 'barbell', 'wr', 'strength', 1],
  ['Snatch', 'full_body', 'shoulders,quads', 'barbell', 'wr', 'strength', 1],
  ['Kettlebell Swing', 'glutes', 'hamstrings,full_body', 'kettlebell', 'wr', 'strength', 1],
  ['Turkish Get Up', 'full_body', 'shoulders,abs', 'kettlebell', 'wr', 'strength', 1],
  // Calisthenics ladders
  ['Dead Hang', 'forearms', 'lats', 'bodyweight', 'dur', 'calisthenics', 0],
  ['Scapular Pull Up', 'lats', '', 'bodyweight', 'bw', 'calisthenics', 0],
  ['Negative Pull Up', 'lats', 'biceps', 'bodyweight', 'bw', 'calisthenics', 1],
  ['Band Assisted Pull Up', 'lats', 'biceps', 'band', 'bw', 'calisthenics', 1],
  ['Pull Up', 'lats', 'biceps', 'bodyweight', 'bw', 'calisthenics', 1],
  ['Chin Up', 'lats', 'biceps', 'bodyweight', 'bw', 'calisthenics', 1],
  ['L-Sit Pull Up', 'lats', 'abs', 'bodyweight', 'bw', 'calisthenics', 1],
  ['Archer Pull Up', 'lats', 'biceps', 'bodyweight', 'bw', 'calisthenics', 1],
  ['Muscle Up', 'lats', 'triceps,chest', 'bodyweight', 'bw', 'calisthenics', 1],
  ['Wall Push Up', 'chest', 'triceps', 'bodyweight', 'bw', 'calisthenics', 1],
  ['Incline Push Up', 'chest', 'triceps', 'bodyweight', 'bw', 'calisthenics', 1],
  ['Push Up', 'chest', 'triceps,shoulders', 'bodyweight', 'bw', 'calisthenics', 1],
  ['Diamond Push Up', 'triceps', 'chest', 'bodyweight', 'bw', 'calisthenics', 1],
  ['Archer Push Up', 'chest', 'triceps', 'bodyweight', 'bw', 'calisthenics', 1],
  ['Pseudo Planche Push Up', 'shoulders', 'chest,triceps', 'bodyweight', 'bw', 'calisthenics', 1],
  ['One Arm Push Up', 'chest', 'triceps,abs', 'bodyweight', 'bw', 'calisthenics', 1],
  ['Pike Push Up', 'shoulders', 'triceps', 'bodyweight', 'bw', 'calisthenics', 1],
  ['Wall Plank Hold', 'shoulders', 'abs', 'bodyweight', 'dur', 'calisthenics', 0],
  ['Chest To Wall Handstand', 'shoulders', 'abs', 'bodyweight', 'dur', 'calisthenics', 0],
  ['Freestanding Handstand', 'shoulders', 'abs', 'bodyweight', 'dur', 'calisthenics', 0],
  ['Handstand Push Up', 'shoulders', 'triceps', 'bodyweight', 'bw', 'calisthenics', 1],
  ['Bodyweight Squat', 'quads', 'glutes', 'bodyweight', 'bw', 'calisthenics', 1],
  ['Split Squat', 'quads', 'glutes', 'bodyweight', 'bw', 'calisthenics', 1],
  ['Bulgarian Split Squat (Bodyweight)', 'quads', 'glutes', 'bodyweight', 'bw', 'calisthenics', 1],
  ['Shrimp Squat', 'quads', 'glutes', 'bodyweight', 'bw', 'calisthenics', 1],
  ['Pistol Squat', 'quads', 'glutes', 'bodyweight', 'bw', 'calisthenics', 1],
  ['Hollow Body Hold', 'abs', '', 'bodyweight', 'dur', 'calisthenics', 0],
  ['L-Sit', 'abs', 'triceps', 'bodyweight', 'dur', 'calisthenics', 0],
  ['V-Sit', 'abs', '', 'bodyweight', 'dur', 'calisthenics', 0],
  ['Dragon Flag', 'abs', '', 'bodyweight', 'bw', 'calisthenics', 0],
  ['Tuck Front Lever', 'lats', 'abs', 'bodyweight', 'dur', 'calisthenics', 0],
  ['Front Lever', 'lats', 'abs', 'bodyweight', 'dur', 'calisthenics', 0],
  ['Tuck Planche', 'shoulders', 'abs', 'bodyweight', 'dur', 'calisthenics', 0],
  // Cardio
  ['Running', 'cardio', '', 'none', 'dist', 'cardio', 0],
  ['Treadmill Run', 'cardio', '', 'machine', 'dist', 'cardio', 0],
  ['Walking', 'cardio', '', 'none', 'dist', 'cardio', 0],
  ['Hiking', 'cardio', '', 'none', 'dist', 'cardio', 0],
  ['Cycling', 'cardio', '', 'none', 'dist', 'cardio', 0],
  ['Stationary Bike', 'cardio', '', 'machine', 'dist', 'cardio', 0],
  ['Rowing Machine', 'cardio', 'upper_back', 'machine', 'dist', 'cardio', 0],
  ['Swimming', 'cardio', 'full_body', 'none', 'dist', 'cardio', 0],
  ['Elliptical', 'cardio', '', 'machine', 'dist', 'cardio', 0],
  ['Stair Climber', 'cardio', 'glutes', 'machine', 'dur', 'cardio', 0],
  ['Jump Rope', 'cardio', 'calves', 'other', 'dur', 'cardio', 0],
  ['Ski Erg', 'cardio', 'lats', 'machine', 'dist', 'cardio', 0],
  ['Assault Bike', 'cardio', 'full_body', 'machine', 'dur', 'cardio', 0],
  // Conditioning
  ['Burpee', 'full_body', '', 'bodyweight', 'bw', 'conditioning', 1],
  ['Box Jump', 'quads', 'glutes,calves', 'other', 'bw', 'conditioning', 1],
  ['Thruster', 'full_body', 'quads,shoulders', 'barbell', 'wr', 'conditioning', 1],
  ['Wall Ball', 'full_body', 'quads,shoulders', 'other', 'wr', 'conditioning', 1],
  ['Sled Push', 'quads', 'glutes,full_body', 'other', 'wr', 'conditioning', 1],
  ['Battle Ropes', 'shoulders', 'full_body', 'other', 'dur', 'conditioning', 0],
  ['Mountain Climber', 'abs', 'full_body', 'bodyweight', 'dur', 'conditioning', 0],
  ['Interval Session', 'full_body', '', 'none', 'dur', 'conditioning', 0],
  // Combat
  ['Shadow Boxing', 'full_body', 'shoulders', 'none', 'dur', 'combat', 0],
  ['Heavy Bag Rounds', 'full_body', 'shoulders', 'other', 'dur', 'combat', 0],
  ['Pad Work', 'full_body', 'shoulders', 'other', 'dur', 'combat', 0],
  ['Sparring', 'full_body', '', 'none', 'dur', 'combat', 0],
  ['BJJ Rolling', 'full_body', '', 'none', 'dur', 'combat', 0],
  ['BJJ Drilling', 'full_body', '', 'none', 'dur', 'combat', 0],
  ['Muay Thai Clinch', 'full_body', 'traps', 'none', 'dur', 'combat', 0],
  ['Wrestling Shots', 'quads', 'full_body', 'none', 'bw', 'combat', 0],
  // Mobility / yoga
  ['Hip Flexor Stretch', 'mobility', 'quads', 'none', 'dur', 'mobility', 0],
  ['Pigeon Pose', 'mobility', 'glutes', 'none', 'dur', 'mobility', 0],
  ['Deep Squat Hold', 'mobility', 'adductors', 'none', 'dur', 'mobility', 0],
  ['Downward Dog', 'mobility', 'hamstrings,calves', 'none', 'dur', 'mobility', 0],
  ['Couch Stretch', 'mobility', 'quads', 'none', 'dur', 'mobility', 0],
  ['Thoracic Rotation', 'mobility', 'upper_back', 'none', 'bw', 'mobility', 0],
  ['Cat Cow', 'mobility', 'lower_back', 'none', 'bw', 'mobility', 0],
  ['Shoulder Dislocates', 'mobility', 'shoulders', 'band', 'bw', 'mobility', 0],
  ['Jefferson Curl', 'mobility', 'hamstrings,lower_back', 'dumbbell', 'wr', 'mobility', 0],
  ['Pancake Stretch', 'mobility', 'adductors,hamstrings', 'none', 'dur', 'mobility', 0],
  ['Front Split', 'mobility', 'hamstrings', 'none', 'dur', 'mobility', 0],
  ['Sun Salutation Flow', 'mobility', 'full_body', 'none', 'dur', 'mobility', 0],
  ['Yoga Session', 'mobility', 'full_body', 'none', 'dur', 'mobility', 0],
  ['Foam Rolling', 'mobility', 'full_body', 'other', 'dur', 'mobility', 0],
  // Climbing
  ['Bouldering', 'forearms', 'lats,full_body', 'none', 'climb', 'climbing', 0],
  ['Top Rope Climbing', 'forearms', 'lats', 'none', 'climb', 'climbing', 0],
  ['Lead Climbing', 'forearms', 'lats', 'none', 'climb', 'climbing', 0],
  ['Hangboard Hang', 'forearms', '', 'other', 'dur', 'climbing', 0],
  ['Campus Board', 'forearms', 'lats', 'other', 'bw', 'climbing', 0]
];

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }

const BUILTIN_EXERCISES = RAW_EXERCISES.map(([name, muscle, sec, equipment, type, discipline, compound]) => ({
  id: slug(name), name, muscle, secondary: sec ? sec.split(',') : [], equipment, type, discipline, compound: !!compound, builtin: true
}));

// Calisthenics / skill progression ladders: complete the goal to unlock the next step.
const LADDERS = [
  { id: 'pull', name: 'Pull-up to muscle-up', steps: [
    ['dead_hang', 3, 30], ['scapular_pull_up', 3, 10], ['negative_pull_up', 3, 5], ['band_assisted_pull_up', 3, 8],
    ['pull_up', 3, 8], ['l_sit_pull_up', 3, 6], ['archer_pull_up', 3, 5], ['muscle_up', 3, 3]] },
  { id: 'push', name: 'Push-up to one-arm push-up', steps: [
    ['wall_push_up', 3, 20], ['incline_push_up', 3, 15], ['push_up', 3, 20], ['diamond_push_up', 3, 12],
    ['archer_push_up', 3, 8], ['pseudo_planche_push_up', 3, 8], ['one_arm_push_up', 3, 5]] },
  { id: 'squat', name: 'Squat to pistol', steps: [
    ['bodyweight_squat', 3, 25], ['split_squat', 3, 15], ['bulgarian_split_squat_bodyweight', 3, 12],
    ['shrimp_squat', 3, 6], ['pistol_squat', 3, 5]] },
  { id: 'handstand', name: 'Handstand to handstand push-up', steps: [
    ['wall_plank_hold', 3, 30], ['chest_to_wall_handstand', 3, 45], ['pike_push_up', 3, 12],
    ['freestanding_handstand', 3, 20], ['handstand_push_up', 3, 5]] },
  { id: 'core', name: 'Plank to dragon flag', steps: [
    ['plank', 3, 60], ['hollow_body_hold', 3, 40], ['hanging_leg_raise', 3, 12], ['l_sit', 3, 20],
    ['v_sit', 3, 10], ['dragon_flag', 3, 5]] },
  { id: 'lever', name: 'Front lever', steps: [
    ['dead_hang', 3, 45], ['hollow_body_hold', 3, 45], ['tuck_front_lever', 3, 15], ['front_lever', 3, 8]] }
].map(l => ({ ...l, steps: l.steps.map(([exId, sets, goal]) => ({ exId, sets, goal })) }));

const CLIMB_GRADES = {
  boulder: ['VB', 'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12'],
  route: ['5.6', '5.7', '5.8', '5.9', '5.10a', '5.10b', '5.10c', '5.10d', '5.11a', '5.11b', '5.11c', '5.11d', '5.12a', '5.12b', '5.12c', '5.12d', '5.13a']
};

// Ready-made programs (all free).
const PROGRAMS = [
  { id: 'ppl', name: 'Push pull legs', desc: '6 days, hypertrophy', routines: [
    ['Push', [['bench_press_barbell', 4, 6, 10], ['seated_shoulder_press_dumbbell', 3, 8, 12], ['incline_bench_press_dumbbell', 3, 8, 12], ['lateral_raise_dumbbell', 3, 12, 20], ['triceps_pushdown_cable', 3, 10, 15]]],
    ['Pull', [['pull_up_weighted', 4, 6, 10], ['bent_over_row_barbell', 3, 8, 12], ['seated_cable_row', 3, 10, 12], ['face_pull', 3, 12, 20], ['bicep_curl_dumbbell', 3, 10, 15]]],
    ['Legs', [['squat_barbell', 4, 5, 8], ['romanian_deadlift_barbell', 3, 8, 12], ['leg_press_machine', 3, 10, 15], ['lying_leg_curl_machine', 3, 10, 15], ['standing_calf_raise_machine', 4, 10, 20]]]] },
  { id: 'ul', name: 'Upper lower', desc: '4 days, strength and size', routines: [
    ['Upper A', [['bench_press_barbell', 4, 5, 8], ['bent_over_row_barbell', 4, 6, 10], ['overhead_press_barbell', 3, 6, 10], ['lat_pulldown_cable', 3, 8, 12], ['bicep_curl_barbell', 2, 10, 15], ['skullcrusher_ez_bar', 2, 10, 15]]],
    ['Lower A', [['squat_barbell', 4, 5, 8], ['romanian_deadlift_barbell', 3, 8, 10], ['bulgarian_split_squat', 3, 8, 12], ['seated_leg_curl_machine', 3, 10, 15], ['hanging_leg_raise', 3, 8, 15]]],
    ['Upper B', [['incline_bench_press_dumbbell', 4, 8, 12], ['dumbbell_row', 4, 8, 12], ['arnold_press_dumbbell', 3, 8, 12], ['chest_dip', 3, 8, 15], ['hammer_curl_dumbbell', 3, 10, 15]]],
    ['Lower B', [['deadlift_barbell', 3, 3, 6], ['front_squat_barbell', 3, 6, 10], ['hip_thrust_barbell', 3, 8, 12], ['leg_extension_machine', 3, 12, 15], ['seated_calf_raise', 3, 12, 20]]]] },
  { id: 'fb', name: 'Full body 3x', desc: '3 days, beginner friendly', routines: [
    ['Full body A', [['squat_barbell', 3, 5, 8], ['bench_press_barbell', 3, 5, 8], ['bent_over_row_barbell', 3, 6, 10], ['plank', 3, 30, 60]]],
    ['Full body B', [['deadlift_barbell', 3, 3, 5], ['overhead_press_barbell', 3, 5, 8], ['lat_pulldown_cable', 3, 8, 12], ['walking_lunge_dumbbell', 3, 8, 12]]]] },
  { id: '5x5', name: 'Strength 5x5', desc: '3 days, linear progression', routines: [
    ['5x5 A', [['squat_barbell', 5, 5, 5], ['bench_press_barbell', 5, 5, 5], ['bent_over_row_barbell', 5, 5, 5]]],
    ['5x5 B', [['squat_barbell', 5, 5, 5], ['overhead_press_barbell', 5, 5, 5], ['deadlift_barbell', 1, 5, 5]]]] },
  { id: 'cali', name: 'Calisthenics foundations', desc: '3 days, no equipment but a bar', routines: [
    ['Cali pull and legs', [['pull_up', 4, 5, 10], ['chin_up', 3, 5, 10], ['bulgarian_split_squat_bodyweight', 3, 8, 15], ['hanging_leg_raise', 3, 8, 15], ['hollow_body_hold', 3, 20, 45]]],
    ['Cali push and core', [['push_up', 4, 10, 20], ['pike_push_up', 3, 6, 12], ['triceps_dip', 3, 8, 15], ['l_sit', 3, 10, 30], ['plank', 3, 30, 60]]]] },
  { id: 'run', name: 'Run base builder', desc: '3 runs a week, 10% rule', routines: [
    ['Easy run', [['running', 1, 0, 0]]], ['Long run', [['running', 1, 0, 0]]], ['Run plus mobility', [['running', 1, 0, 0], ['hip_flexor_stretch', 2, 30, 60], ['pigeon_pose', 2, 30, 60]]]] },
  { id: 'mob', name: 'Daily mobility', desc: '15 minutes, every day', routines: [
    ['Mobility flow', [['cat_cow', 2, 10, 10], ['thoracic_rotation', 2, 10, 10], ['deep_squat_hold', 3, 30, 60], ['couch_stretch', 2, 30, 60], ['pigeon_pose', 2, 30, 60], ['downward_dog', 2, 30, 60]]]] }
];
