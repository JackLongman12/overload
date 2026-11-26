// How to do each exercise: [category, steps, key tip]. Shown in the library, the exercise screen
// and the workout. Categories group long lists so they're easier to scan.
'use strict';

const HOWTO = {
  // ---------- Chest
  bench_press_barbell: ['Chest', 'Lie on the bench, eyes under the bar, feet flat. Grip a little wider than shoulders, unrack, lower the bar to mid-chest, then press back up over your shoulders.', 'Squeeze your shoulder blades together and keep them pinned. Use a spotter or safety arms for heavy sets.'],
  incline_bench_press_barbell: ['Chest', 'Set the bench to 30–45°. Unrack, lower the bar to your upper chest, then press up and slightly back.', 'Keep your hips on the bench and your wrists stacked over your elbows.'],
  decline_bench_press_barbell: ['Chest', 'Hook your legs in the decline bench. Lower the bar to your lower chest and press it back up.', 'Use a spotter: getting the bar back to the rack is awkward on a decline.'],
  bench_press_dumbbell: ['Chest', 'Sit with dumbbells on your thighs, lie back and bring them over your chest. Lower until your elbows are just below the bench, then press up.', 'Elbows at about 45° from your body, not flared straight out.'],
  incline_bench_press_dumbbell: ['Chest', 'Bench at 30–45°. Press the dumbbells from upper-chest level until your arms are straight.', 'Lower slowly (2–3 seconds) for more chest work.'],
  chest_fly_dumbbell: ['Chest', 'Lie flat with dumbbells over your chest, palms facing. Open your arms in a wide arc with a slight bend in the elbows, then hug them back together.', 'Stop when you feel a stretch in your chest. Go light: this is not a press.'],
  cable_fly_crossovers: ['Chest', 'Set both pulleys high, step forward, and bring the handles together in front of your chest in an arc.', 'Keep the elbow bend fixed and squeeze for a second at the middle.'],
  chest_press_machine: ['Chest', 'Adjust the seat so the handles line up with mid-chest. Press forward until your arms are straight, then return slowly.', 'Keep your back and head against the pad.'],
  pec_deck_machine: ['Chest', 'Sit with your back flat, forearms or hands on the pads, and bring them together in front of you.', 'Control the way back; don\'t let the stack slam.'],
  smith_machine_bench_press: ['Chest', 'Set up like a bench press under the Smith bar. Unhook it, lower to mid-chest and press up.', 'Set the safety stops just below chest height.'],
  chest_dip: ['Chest', 'Support yourself on parallel bars, lean your chest forward and lower until your shoulders are just below your elbows, then push up.', 'Leaning forward works chest; staying upright works triceps more.'],
  chest_dip_weighted: ['Chest', 'Dips with a dip belt or a dumbbell between your feet. Lower under control and press back up.', 'Only add weight once you can do 10+ clean bodyweight dips.'],

  // ---------- Back
  deadlift_barbell: ['Back', 'Stand with the bar over mid-foot. Hinge down, grip just outside your legs, chest up and back flat. Push the floor away and stand tall, then lower the bar the same way.', 'Keep the bar touching your legs the whole way. Never round your lower back.'],
  bent_over_row_barbell: ['Back', 'Hinge forward to about 45° with a flat back. Pull the bar to your lower ribs, then lower it with control.', 'Lead with your elbows and don\'t jerk your torso up.'],
  pendlay_row_barbell: ['Back', 'Back flat and nearly parallel to the floor. Pull the bar explosively from the floor to your chest, then set it down each rep.', 'Reset your back position on every rep.'],
  t_bar_row: ['Back', 'Straddle the bar, hinge forward with a flat back and row the handle to your chest.', 'Squeeze your shoulder blades together at the top.'],
  dumbbell_row: ['Back', 'One knee and hand on a bench, back flat. Row the dumbbell to your hip, then lower it until your arm is straight.', 'Pull toward your hip, not your shoulder, to work the lats.'],
  seated_cable_row: ['Back', 'Sit tall, knees slightly bent. Pull the handle to your stomach, then let your arms straighten forward.', 'Don\'t rock back and forth; move only your arms and shoulder blades.'],
  lat_pulldown_cable: ['Back', 'Grip the bar wider than shoulders, thighs under the pad. Pull the bar to your upper chest, then let it rise until your arms are straight.', 'Lean back only slightly and drive your elbows down.'],
  close_grip_lat_pulldown: ['Back', 'Use a close or neutral handle and pull it to your upper chest.', 'Full stretch at the top of every rep.'],
  straight_arm_pulldown: ['Back', 'Stand facing a high cable, arms almost straight. Sweep the bar down to your thighs in an arc.', 'Keep your elbows locked in a slight bend; it\'s a lat isolation.'],
  pull_up_weighted: ['Back', 'Pull-ups with a dip belt or a dumbbell between your feet. Hang at the bottom, pull your chest toward the bar.', 'Add weight only when you can do 3 × 8 clean bodyweight pull-ups.'],
  chin_up_weighted: ['Back', 'Chin-ups (palms facing you) with added weight. Pull until your chin clears the bar.', 'Full hang at the bottom on every rep.'],
  rack_pull: ['Back', 'A deadlift from pins set around knee height. Grip, brace and stand up with the bar.', 'Good for upper back and grip; keep your back flat.'],
  back_extension: ['Back', 'In a 45° or horizontal back-extension bench, bend at the hips to lower your torso, then lift until your body is straight.', 'Don\'t over-arch at the top.'],
  face_pull: ['Shoulders', 'Rope on a high cable. Pull it toward your face, hands ending beside your ears, elbows high.', 'Great for shoulder health. Use a light weight and pause at the end.'],
  shrug_barbell: ['Back', 'Hold the bar at arm\'s length and lift your shoulders straight up toward your ears. Pause, then lower.', 'No rolling of the shoulders; straight up and down.'],
  shrug_dumbbell: ['Back', 'Dumbbells at your sides, lift your shoulders up, pause, lower.', 'Hold the top for a second.'],

  // ---------- Shoulders
  overhead_press_barbell: ['Shoulders', 'Bar at your collarbones, grip just outside shoulders. Squeeze glutes and press the bar overhead, moving your head back slightly to let it pass.', 'Finish with the bar over the middle of your feet and don\'t lean back.'],
  seated_shoulder_press_dumbbell: ['Shoulders', 'Sit upright with dumbbells at shoulder height. Press them overhead until your arms are straight.', 'Keep your back against the bench.'],
  arnold_press_dumbbell: ['Shoulders', 'Start with dumbbells in front of your shoulders, palms facing you. Rotate your palms forward as you press up.', 'Smooth rotation; go lighter than a normal press.'],
  shoulder_press_machine: ['Shoulders', 'Adjust the seat so handles are at shoulder height and press up.', 'Don\'t lock out hard at the top.'],
  lateral_raise_dumbbell: ['Shoulders', 'Stand with dumbbells at your sides. Raise them out to shoulder height with slightly bent elbows, then lower slowly.', 'Lead with your elbows; light weight, no swinging.'],
  lateral_raise_cable: ['Shoulders', 'Stand side-on to a low cable and raise the handle out to shoulder height.', 'The cable keeps tension at the bottom; go slow.'],
  rear_delt_fly_dumbbell: ['Shoulders', 'Hinge forward, dumbbells hanging. Raise them out to the sides, squeezing the backs of your shoulders.', 'Light weight; don\'t squeeze your shoulder blades too hard.'],
  reverse_pec_deck: ['Shoulders', 'Face the pec-deck pad and open your arms backward.', 'Stop when your arms are in line with your body.'],
  front_raise_dumbbell: ['Shoulders', 'Raise dumbbells in front of you to shoulder height, then lower.', 'No swinging; often not needed if you press.'],
  upright_row_barbell: ['Shoulders', 'Hold the bar with a shoulder-width grip and pull it up to lower-chest height, elbows high.', 'Stop at chest height to protect your shoulders.'],
  push_press: ['Shoulders', 'Bar at your collarbones. Dip your knees a little, then drive up and use that push to press the bar overhead.', 'Short, quick dip; the legs start it, the arms finish.'],

  // ---------- Arms
  bicep_curl_barbell: ['Arms', 'Stand tall, bar at arm\'s length. Curl it up to your shoulders, then lower slowly.', 'Elbows stay at your sides; no swinging.'],
  bicep_curl_dumbbell: ['Arms', 'Dumbbells at your sides, palms forward. Curl up and lower slowly.', 'Turn your little finger up at the top for a stronger squeeze.'],
  hammer_curl_dumbbell: ['Arms', 'Curl the dumbbells with palms facing each other.', 'Works the forearm and outer biceps.'],
  preacher_curl_ez_bar: ['Arms', 'Arms over the preacher pad. Curl the bar up and lower it until your arms are almost straight.', 'Control the bottom; that\'s where strains happen.'],
  incline_curl_dumbbell: ['Arms', 'Lie back on an incline bench, arms hanging. Curl both dumbbells up.', 'Big stretch at the bottom; go lighter.'],
  bicep_curl_cable: ['Arms', 'Curl a bar or rope from a low cable.', 'Constant tension; squeeze at the top.'],
  triceps_pushdown_cable: ['Arms', 'Stand at a high cable, elbows at your sides. Push the bar or rope down until your arms are straight.', 'Only your forearms move.'],
  overhead_triceps_extension_cable: ['Arms', 'Face away from the cable, rope behind your head. Extend your arms overhead.', 'Keep your elbows pointing forward.'],
  skullcrusher_ez_bar: ['Arms', 'Lie on a bench, bar over your chest. Bend your elbows to lower it toward your forehead, then straighten.', 'Elbows stay pointing at the ceiling.'],
  close_grip_bench_press: ['Arms', 'Bench press with hands shoulder-width apart. Lower to your lower chest and press up.', 'Tuck your elbows close to your body.'],
  triceps_dip: ['Arms', 'On parallel bars or a bench behind you, stay upright and lower until your elbows are at 90°, then push up.', 'Stop if you feel a pinch at the front of your shoulder.'],
  wrist_curl_dumbbell: ['Arms', 'Forearms on your thighs, palms up. Curl the dumbbell up with your wrist only.', 'Light weight, high reps.'],
  farmers_walk: ['Full body', 'Pick up heavy dumbbells or handles and walk with short, quick steps for the set time or distance.', 'Stand tall, shoulders back, grip hard.'],

  // ---------- Legs
  squat_barbell: ['Legs', 'Bar on your upper back, feet shoulder-width. Sit down between your heels until your hips are at or below your knees, then stand up.', 'Knees follow your toes, chest up. Use safety pins in the rack.'],
  front_squat_barbell: ['Legs', 'Bar resting on the front of your shoulders, elbows high. Squat down and stand up.', 'Keep your elbows up so the bar doesn\'t roll forward.'],
  goblet_squat: ['Legs', 'Hold a dumbbell or kettlebell at your chest and squat down between your knees.', 'A great way to learn the squat.'],
  hack_squat_machine: ['Legs', 'Shoulders under the pads, feet on the platform. Lower until your thighs are parallel, then push up.', 'Don\'t lock your knees at the top.'],
  leg_press_machine: ['Legs', 'Feet shoulder-width on the platform. Lower until your knees are at about 90°, then press back.', 'Keep your lower back on the pad.'],
  bulgarian_split_squat: ['Legs', 'Rear foot on a bench, dumbbells in hand. Lower your back knee toward the floor, then push up through the front foot.', 'Most of the weight on the front heel.'],
  walking_lunge_dumbbell: ['Legs', 'Step forward into a lunge, back knee just above the floor, then step through into the next lunge.', 'Count each leg as a rep, or both together; be consistent.'],
  leg_extension_machine: ['Legs', 'Pad on your shins, straighten your legs fully, then lower slowly.', 'Squeeze at the top for a second.'],
  romanian_deadlift_barbell: ['Legs', 'Stand with the bar. Push your hips back with soft knees, sliding the bar down your thighs until you feel a hamstring stretch, then stand up.', 'Flat back; the bar never drifts away from your legs.'],
  romanian_deadlift_dumbbell: ['Legs', 'Same as the barbell version with dumbbells: hips back, flat back, stretch, stand.', 'Stop when your back would start to round.'],
  lying_leg_curl_machine: ['Legs', 'Lie face down, pad above your heels. Curl your heels toward your glutes.', 'Keep your hips down on the pad.'],
  seated_leg_curl_machine: ['Legs', 'Sit with the pad on your lower calves and pull your heels under the seat.', 'Lean forward slightly for a better stretch.'],
  nordic_hamstring_curl: ['Legs', 'Kneel with your ankles held. Lower your body forward as slowly as you can, catch yourself with your hands, push back up.', 'Hard: start with a short range and grow it.'],
  hip_thrust_barbell: ['Legs', 'Upper back on a bench, bar over your hips (use a pad). Drive your hips up until your body is straight, then lower.', 'Chin tucked, squeeze your glutes at the top.'],
  glute_bridge: ['Legs', 'Lie on your back, knees bent. Lift your hips until your body is straight, then lower.', 'Push through your heels.'],
  cable_kickback: ['Legs', 'Ankle strap on a low cable. Kick your leg straight back, squeezing your glute.', 'Don\'t arch your lower back.'],
  hip_abduction_machine: ['Legs', 'Sit with pads outside your knees and push your legs apart.', 'Slow on the way back.'],
  hip_adduction_machine: ['Legs', 'Pads inside your knees, squeeze your legs together.', 'Start light; adductors strain easily.'],
  sumo_deadlift: ['Legs', 'Wide stance, toes out, hands inside your knees. Push your knees out and stand up with the bar.', 'Hips start closer to the bar than in a normal deadlift.'],
  standing_calf_raise_machine: ['Legs', 'Balls of your feet on the edge. Lower your heels for a stretch, then rise as high as you can.', 'Pause at the bottom and the top.'],
  seated_calf_raise: ['Legs', 'Seated with the pad on your knees, raise your heels.', 'Works the lower calf muscle.'],

  // ---------- Core
  cable_crunch: ['Core', 'Kneel facing a high cable with the rope at your head. Curl your chest toward your knees.', 'Move by rounding your spine, not by bending at the hips.'],
  crunch: ['Core', 'Lie on your back, knees bent. Lift your shoulders off the floor by curling your chest up.', 'Don\'t pull on your neck.'],
  hanging_leg_raise: ['Core', 'Hang from a bar and lift your legs (bent or straight) as high as you can, then lower slowly.', 'No swinging: pause at the bottom.'],
  ab_wheel_rollout: ['Core', 'Kneel holding the wheel, roll forward as far as you can control, then roll back.', 'Keep your back from sagging.'],
  russian_twist: ['Core', 'Sit leaning back with feet up or down and rotate your torso side to side.', 'Each side counts as one rep.'],
  pallof_press: ['Core', 'Stand side-on to a cable at chest height. Press the handle straight out and hold, resisting the pull.', 'Don\'t let your body rotate.'],
  plank: ['Core', 'Forearms and toes on the floor, body in a straight line. Hold for the set time.', 'Squeeze glutes and abs; don\'t let your hips sag.'],
  side_plank: ['Core', 'On one forearm and the side of your feet, lift your hips into a straight line. Hold, then switch sides.', 'Log the time per side.'],

  // ---------- Power
  power_clean: ['Power', 'Start like a deadlift. Push the bar off the floor, jump explosively at mid-thigh and pull yourself under to catch it on your shoulders in a quarter squat.', 'Learn it with a coach or an empty bar first.'],
  clean_and_jerk: ['Power', 'Clean the bar to your shoulders, then dip and drive it overhead, splitting your feet to catch it.', 'Technical lift: start light.'],
  snatch: ['Power', 'Wide grip. Pull the bar from the floor and in one movement catch it overhead in a squat.', 'Technical lift: learn with a PVC pipe first.'],
  kettlebell_swing: ['Power', 'Hike the kettlebell between your legs, then snap your hips forward to swing it to chest height.', 'It\'s a hip hinge, not a squat or a front raise.'],
  turkish_get_up: ['Power', 'Lie with the kettlebell pressed up. Stand up in steps while keeping it overhead, then reverse to lie down.', 'Eyes on the bell; one rep each side.'],

  // ---------- Calisthenics
  dead_hang: ['Pull', 'Hang from a bar with straight arms for the set time.', 'Builds grip and shoulder strength; relax your shoulders or gently engage them.'],
  scapular_pull_up: ['Pull', 'Hang with straight arms and pull your shoulder blades down to lift your body a few centimetres, then relax.', 'Arms stay straight the whole time.'],
  negative_pull_up: ['Pull', 'Jump or step up to the top of a pull-up and lower yourself as slowly as you can (3–5 seconds).', 'The step before full pull-ups.'],
  band_assisted_pull_up: ['Pull', 'Loop a band over the bar and under a foot or knee. Do pull-ups with the band\'s help.', 'Use a thinner band as you get stronger.'],
  pull_up: ['Pull', 'Hang with palms facing away, hands shoulder-width or wider. Pull until your chin is over the bar, then lower to straight arms.', 'Full hang at the bottom; no kipping.'],
  chin_up: ['Pull', 'Like a pull-up with palms facing you. Pull your chin over the bar.', 'Usually easier than pull-ups; more biceps.'],
  l_sit_pull_up: ['Pull', 'Pull-ups while holding your legs straight out in front.', 'Needs a solid L-sit first.'],
  archer_pull_up: ['Pull', 'Wide grip. Pull toward one hand while the other arm stays straight, alternating sides.', 'A step toward the one-arm pull-up.'],
  muscle_up: ['Pull', 'Pull explosively high, lean forward over the bar and press up to straight arms on top.', 'Needs about 10 strict pull-ups and 10 dips first.'],
  wall_push_up: ['Push', 'Hands on a wall, step back and do push-ups against it.', 'Starting point if floor push-ups are too hard.'],
  incline_push_up: ['Push', 'Hands on a bench or table, body straight, lower your chest to it and push away.', 'The lower the surface, the harder it gets.'],
  push_up: ['Push', 'Hands under your shoulders, body straight. Lower your chest to just above the floor and push back up.', 'Elbows at about 45°; don\'t let your hips sag.'],
  diamond_push_up: ['Push', 'Push-ups with hands together under your chest, forming a diamond.', 'More triceps.'],
  archer_push_up: ['Push', 'Wide hands; lower toward one hand while the other arm stays straight.', 'Alternate sides; counts each side.'],
  pseudo_planche_push_up: ['Push', 'Hands by your hips, fingers turned out, lean your shoulders forward past your hands and do push-ups.', 'The more you lean, the harder it is.'],
  one_arm_push_up: ['Push', 'Feet wide, one hand under your chest. Lower and push up on one arm.', 'Keep your hips square to the floor.'],
  pike_push_up: ['Push', 'Hips high in an upside-down V. Bend your elbows to bring your head toward the floor between your hands, then push up.', 'Builds toward handstand push-ups.'],
  wall_plank_hold: ['Handstand', 'Start in a push-up position with feet against a wall and walk your feet up a little. Hold.', 'First step to the handstand.'],
  chest_to_wall_handstand: ['Handstand', 'Walk your feet up the wall until your chest faces it and your body is straight. Hold.', 'Push the floor away; shoulders by your ears.'],
  freestanding_handstand: ['Handstand', 'Kick up to a handstand away from the wall and balance for the set time.', 'Balance with your fingers.'],
  handstand_push_up: ['Handstand', 'In a handstand (against a wall at first), lower your head to the floor and press back up.', 'Use a pad under your head.'],
  bodyweight_squat: ['Legs', 'Feet shoulder-width, squat down until your thighs are parallel or lower, then stand up.', 'Heels down, chest up.'],
  split_squat: ['Legs', 'Stand in a long stride and lower your back knee toward the floor, then come up.', 'Do all reps on one leg, then switch.'],
  bulgarian_split_squat_bodyweight: ['Legs', 'Rear foot on a bench, lower your back knee and stand up through the front leg.', 'Reps are per leg.'],
  shrimp_squat: ['Legs', 'Stand on one leg holding the other foot behind you, lower your back knee to the floor and stand up.', 'Use a wall for balance at first.'],
  pistol_squat: ['Legs', 'On one leg with the other straight in front, squat all the way down and stand up.', 'Hold onto something until you have the balance.'],
  hollow_body_hold: ['Core', 'Lie on your back, lift your shoulders and straight legs off the floor, lower back pressed down. Hold.', 'If your back lifts, bend your knees.'],
  l_sit: ['Core', 'On parallel bars or the floor, press up and hold your legs straight out in front.', 'Start with bent knees (tuck) if needed.'],
  v_sit: ['Core', 'From an L-sit, lift your legs higher into a V and hold.', 'Advanced: needs strong hip flexors.'],
  dragon_flag: ['Core', 'Lie on a bench gripping behind your head. Lift your body to vertical on your shoulders, then lower it straight and slowly.', 'Lower only as far as you can keep your body straight.'],
  tuck_front_lever: ['Levers', 'Hang from a bar, pull your knees to your chest and lift your body until your back is horizontal. Hold.', 'Push the bar down toward your hips with straight arms.'],
  front_lever: ['Levers', 'Hang and hold your whole body straight and horizontal, face up.', 'Progress through tuck and straddle first.'],
  tuck_planche: ['Levers', 'Hands on the floor or parallettes, lean forward and lift your feet with knees tucked. Hold.', 'Straight arms, rounded upper back.'],

  // ---------- Cardio
  running: ['Run and walk', 'Run outdoors. Log distance and time, or import from your watch.', 'Most runs should be easy enough to talk.'],
  treadmill_run: ['Run and walk', 'Run on a treadmill. Set 1% incline to feel like outdoor running.', 'Log the distance shown on the treadmill.'],
  walking: ['Run and walk', 'A brisk walk. Log distance and time.', 'Counts as recovery work.'],
  hiking: ['Run and walk', 'Walk on trails or hills. Log distance and time.', 'Add elevation in the notes.'],
  cycling: ['Bike', 'Ride outdoors. Log distance and time.', 'Import rides from Strava or Garmin as GPX.'],
  stationary_bike: ['Bike', 'Ride a stationary bike. Log distance and time from the display.', 'Set the seat so your knee is slightly bent at the bottom.'],
  rowing_machine: ['Machines', 'Push with your legs, then lean back slightly and pull the handle to your lower ribs. Reverse: arms, body, legs.', 'Legs do most of the work.'],
  swimming: ['Swim', 'Swim laps. Log distance and time.', 'Note the stroke in the notes.'],
  elliptical: ['Machines', 'Steady movement on the elliptical. Log distance and time.', 'Low impact on joints.'],
  stair_climber: ['Machines', 'Climb at a steady pace for the set time.', 'Don\'t lean on the handrails.'],
  jump_rope: ['Intervals', 'Skip on the balls of your feet for the set time.', 'Small jumps; turn the rope with your wrists.'],
  ski_erg: ['Machines', 'Pull the handles down from overhead by bending at the hips, like double-pole skiing.', 'Use your body weight, not just arms.'],
  assault_bike: ['Bike', 'Pedal and push-pull the handles hard for the interval time.', 'Great for intervals: short and very hard.'],
  burpee: ['Intervals', 'From standing, squat, kick your feet back to a push-up position, bring them back in and jump up.', 'Pace yourself in long sets.'],
  box_jump: ['Intervals', 'Jump onto a box, landing softly with both feet, stand tall, then step down.', 'Step down instead of jumping down to protect your Achilles.'],
  thruster: ['Intervals', 'Front squat with a barbell or dumbbells, and as you stand, press the weight overhead in one movement.', 'Use the leg drive to help the press.'],
  wall_ball: ['Intervals', 'Hold a medicine ball at your chest, squat, then throw it to a target on the wall as you stand. Catch and repeat.', 'Catch into the next squat.'],
  sled_push: ['Intervals', 'Lean into the sled handles with straight arms and drive it forward with short steps.', 'Log the time or distance per push.'],
  battle_ropes: ['Intervals', 'Hold a rope end in each hand and make fast waves for the set time.', 'Slight squat, move from the shoulders.'],
  mountain_climber: ['Intervals', 'In a push-up position, drive your knees to your chest one after the other, fast.', 'Hips level, shoulders over hands.'],
  interval_session: ['Intervals', 'A timed interval workout (HIIT, Tabata, EMOM). Use the timers to run it.', 'Logged automatically when you save a timer.'],

  // ---------- Combat
  shadow_boxing: ['Striking', 'Throw punches, kicks and footwork in the air for each round.', 'Stay on your toes and keep your guard up.'],
  heavy_bag_rounds: ['Striking', 'Hit the heavy bag for each round: combinations, then move.', 'Wear wraps and gloves.'],
  pad_work: ['Striking', 'A partner holds pads and calls combinations for each round.', 'Snap the punch back to your guard.'],
  sparring: ['Striking', 'Controlled practice fight with a partner.', 'Agree on intensity first. Mouthguard on.'],
  bjj_rolling: ['Grappling', 'Live grappling rounds with a partner.', 'Tap early, tap often.'],
  bjj_drilling: ['Grappling', 'Repeat a technique with a cooperative partner for the round.', 'Slow and perfect first, then speed.'],
  muay_thai_clinch: ['Grappling', 'Clinch work: hand fighting, knees and off-balancing for each round.', 'Control the head and posture.'],
  wrestling_shots: ['Grappling', 'Change levels and shoot into a double- or single-leg takedown. Log reps.', 'Penetration step deep under the opponent.'],

  // ---------- Mobility
  hip_flexor_stretch: ['Hips', 'Kneel on one knee, other foot in front. Squeeze your glute and shift forward until you feel a stretch at the front of the hip. Hold, then switch.', 'Don\'t arch your lower back.'],
  pigeon_pose: ['Hips', 'Front leg bent across in front of you, back leg straight behind. Lower your hips and hold.', 'Use a cushion under the hip if it doesn\'t reach the floor.'],
  deep_squat_hold: ['Hips', 'Sink into the lowest squat you can with heels down and hold. Hold onto a post if needed.', 'Push your knees out with your elbows.'],
  downward_dog: ['Full body', 'Hands and feet on the floor, hips high in an upside-down V. Press your heels toward the floor and hold.', 'Bend your knees a little if your back rounds.'],
  couch_stretch: ['Hips', 'Kneel with your back foot up against a wall or couch and lift your torso upright. Hold, then switch.', 'Intense quad and hip-flexor stretch; build up slowly.'],
  thoracic_rotation: ['Spine', 'On hands and knees, put one hand behind your head and rotate that elbow up toward the ceiling, then down. Reps per side.', 'Follow your elbow with your eyes.'],
  cat_cow: ['Spine', 'On hands and knees, round your back up (cat), then let it sink and lift your chest (cow).', 'Move slowly with your breath.'],
  shoulder_dislocates: ['Shoulders', 'Hold a band or stick wide and lift it over your head and behind you with straight arms, then back.', 'Use a wide grip; narrow it over weeks.'],
  jefferson_curl: ['Spine', 'Stand on a box with a light weight and roll down one vertebra at a time, then roll back up.', 'Very light weight, slow. Skip if you have back pain.'],
  pancake_stretch: ['Hips', 'Sit with legs wide and straight, fold forward from the hips. Hold.', 'Lead with your chest, not your head.'],
  front_split: ['Hips', 'Slide into a split with one leg forward and one back, supported by blocks or hands. Hold, then switch.', 'Square hips; never bounce.'],
  sun_salutation_flow: ['Full body', 'Flow through a sun salutation (reach up, fold, plank, up dog, down dog) for the set time.', 'Breathe with each move.'],
  yoga_session: ['Full body', 'A full yoga class or video. Log the time.', 'Counts toward recovery.'],
  foam_rolling: ['Full body', 'Roll slowly over tight muscles (quads, back, calves) for the set time.', 'Pause on tender spots; avoid bones and joints.'],
  frog_stretch: ['Hips', 'On hands and knees, slide your knees wide with feet in line with them, sink your hips back and hold.', 'Key for high steps and drop-knees in climbing.'],
  high_step_mobility: ['Hips', 'Stand side-on to a box at hip height, lift your foot onto it and rock your weight over it, then step down. Reps per side.', 'Keep your torso upright.'],

  // ---------- Climbing
  bouldering: ['Climbs', 'Climb short problems without a rope. Log each problem: its grade, how many tries, and the result (Project, Flash, Sent, Repeat). Optionally the wall angle.', 'Warm up on easy grades. Rest 3–5 minutes between hard attempts.'],
  top_rope_climbing: ['Climbs', 'Climb routes with the rope above you. Log each route\'s grade, tries and result.', 'Check knots and the belayer every time.'],
  lead_climbing: ['Climbs', 'Clip the rope into bolts as you climb. Log each route\'s grade, tries and result (Onsight, Flash, Redpoint).', 'Onsight = first try with no info. Flash = first try with beta.'],
  outdoor_bouldering: ['Climbs', 'Boulder outside on rock. Log each problem with grade, tries and result.', 'Use pads and a spotter.'],
  board_climbing: ['Climbs', 'Climb on a training board (Moonboard, Kilter, Tension). Log each problem\'s grade and result.', 'Board grades are often harsh; track them separately.'],
  spray_wall: ['Climbs', 'Climb set or made-up problems on a spray wall. Log grade and result.', 'Great for limit moves and body tension.'],
  sport_climbing_outdoor: ['Climbs', 'Bolted routes outside. Log each route\'s grade, tries and result.', 'Redpoint = sent after working it.'],
  trad_climbing: ['Climbs', 'Routes where you place your own gear. Log grade, tries and result.', 'Log the route name in the notes.'],
  multi_pitch_climbing: ['Climbs', 'Long routes in several rope lengths. Log the hardest pitch grade, or each pitch.', 'Add the route name in notes.'],
  auto_belay_laps: ['Climbs', 'Lap easy routes on auto-belays for endurance. Log each lap\'s grade.', 'Keep moving; aim for a steady pump, not a fail.'],
  deep_water_solo: ['Climbs', 'Climb above deep water without a rope. Log grade and result.', 'Check water depth first.'],
  speed_climbing: ['Climbs', 'Climb the speed route as fast as possible. Log your time in seconds.', 'Track your best time.'],
  hangboard_hang: ['Fingers', 'Hang from an edge (about 20 mm) with an open or half-crimp grip for the set seconds, then rest 2–3 minutes.', 'Not for your first year of climbing. Stop if fingers hurt.'],
  max_hang_added_weight: ['Fingers', 'Hang a 20 mm edge for 7–10 s with a belt and weight added (or a pulley taking weight off). Rest 3 minutes. Log the added weight and seconds.', 'When every set holds 10 s, the coach adds weight. Your strongest hang shows as % of body weight.'],
  repeaters_7_3: ['Fingers', 'Hang 7 seconds, rest 3 seconds, six times in a row = one set (about 60 s). Rest 3 minutes between sets. Log the set time.', 'Builds finger endurance. Use a bigger edge than for max hangs.'],
  minimum_edge_hang: ['Fingers', 'Hang the smallest edge you can hold for 10 s at body weight. Log seconds.', 'Track the edge size in the notes.'],
  one_arm_hang: ['Fingers', 'Hang from a jug or edge with one arm for the set seconds, shoulder engaged. Switch arms.', 'Advanced. Use a pulley to take weight off at first.'],
  no_hang_block_lift: ['Fingers', 'Grip a block on an edge and lift a weight off the floor for 7–10 s with one hand. Log the weight lifted and seconds.', 'Easier on the shoulders than hanging. Good for beginners.'],
  pinch_block_lift: ['Fingers', 'Pinch a wooden block and lift a weight for the set seconds. Log weight and seconds.', 'Trains thumb and pinch strength.'],
  campus_board: ['Power', 'Climb up the campus rungs using only your arms, feet off. Log moves or ladders as reps.', 'Only for experienced climbers. Warm up fully.'],
  campus_ladder: ['Power', 'Move hand over hand up the campus rungs (1-2-3...). One ladder = one rep.', 'Stop when moves get sloppy.'],
  '4x4_bouldering': ['Endurance', 'Pick 4 problems a few grades below your max. Climb all 4 back to back = one set. Rest 4 minutes, do 4 sets. Log the set time.', 'You should be pumped but still sending by the last set.'],
  arc_traversing: ['Endurance', 'Climb easy terrain continuously for 10–20 minutes with a light pump. Log the time.', 'Never get fully pumped; shake out and keep moving.'],
  lock_off_hold: ['Pull', 'Pull up and hold at the top, at 90° or at 120° elbow angle. Log seconds.', 'Key for reaching static moves.'],
  offset_pull_up: ['Pull', 'One hand on the bar, the other lower on a towel or ring. Pull up, mostly on the high arm.', 'Switch sides; counts per side.'],
  typewriter_pull_up: ['Pull', 'Pull up, then slide side to side along the bar at the top. One side = one rep.', 'Keep your chin above the bar.'],
  frenchies: ['Pull', 'Pull up and lock off 5 s at the top, lower, pull up and lock 5 s at 90°, lower, pull up and lock 5 s at 120°. That\'s one rep.', 'Classic lock-off endurance drill.'],
  front_lever_row: ['Pull', 'From a tuck front lever, pull the bar to your hips and lower again.', 'Use a band if needed.'],
  finger_roll_barbell: ['Fingers', 'Hold a barbell with your fingers, let it roll down to your fingertips, then curl it back up.', 'Light weight, high reps; safe finger strength.'],
  reverse_wrist_curl: ['Antagonist', 'Forearms on your thighs, palms down. Lift the dumbbell with your wrist only.', 'Balances the forearm; helps prevent elbow pain.'],
  finger_extensor_band: ['Antagonist', 'Put a rubber band around your fingers and open them wide against it.', 'Do it after every session.'],
  rice_bucket: ['Antagonist', 'Plunge your hand into a bucket of rice and open, close and twist your hand. Log the time.', 'Cheap and effective forearm prehab.'],
  shoulder_external_rotation_band: ['Antagonist', 'Elbow at your side bent 90°, band in hand. Rotate your forearm outward, then back.', 'Light band, slow. Protects shoulders.']
};

// Groups for lists. Falls back to the main muscle.
function exGroup(ex) {
  const h = HOWTO[ex.id];
  if (h) return h[0];
  return { chest: 'Chest', lats: 'Back', upper_back: 'Back', lower_back: 'Back', traps: 'Back', shoulders: 'Shoulders', biceps: 'Arms', triceps: 'Arms', forearms: 'Arms',
    quads: 'Legs', hamstrings: 'Legs', glutes: 'Legs', calves: 'Legs', adductors: 'Legs', abs: 'Core', obliques: 'Core', cardio: 'Cardio', full_body: 'Full body', mobility: 'Mobility' }[ex.muscle] || 'Other';
}

// What the numbers in a set mean for this exercise
function trackingText(ex) {
  return {
    wr: 'Log weight and reps for each set.', wbw: 'Log added weight (0 for body weight) and reps.', bw: 'Log reps for each set.',
    dur: 'Log seconds for each set (hold or round).', wdur: 'Log the weight and how many seconds you held.', dist: 'Log distance and time.',
    climb: 'Log one row per climb: grade, tries, result and wall angle.'
  }[ex.type] || '';
}

// Steps and tip, with a sensible fallback for custom exercises
function howTo(ex) {
  const h = HOWTO[ex.id];
  if (h) return { steps: h[1], tip: h[2] };
  return { steps: `${trackingText(ex)} Use controlled movement through the full range you can manage.`, tip: 'Add your own cues in the exercise notes during a workout.' };
}

// "3 sets of 8–12 reps", "3 holds of 30–60 s", "8 climbs"
function targetText(ex, t) {
  if (!t) return '';
  const range = (a, b) => (a && b && a !== b ? `${a}–${b}` : `${a || b || ''}`);
  if (ex.type === 'climb') return t.sets > 1 ? `${t.sets} climbs` : 'One row per climb';
  if (ex.type === 'dist') return 'Distance and time';
  if (ex.type === 'dur' || ex.type === 'wdur') return `${t.sets} × ${range(t.repMin, t.repMax)} s`;
  return `${t.sets} sets × ${range(t.repMin, t.repMax)} reps`;
}
