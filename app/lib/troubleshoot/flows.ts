import type { ToolId } from "../job/registry";

// Symptom-driven troubleshooting guides. Each guide is a decision tree: questions lead to
// further questions or to a result listing likely causes to verify. Results never condemn a
// part on their own; they point at the next measurement. An answer's `next` may name another
// guide as "flow:<id>".

export type Answer = { label: string; next: string };
export type QuestionNode = { kind: "question"; prompt: string; detail?: string; tool?: ToolId; safety?: string; answers: Answer[] };
export type ResultNode = { kind: "result"; title: string; causes: string[]; checks?: string[]; tools?: ToolId[]; safety?: string };
export type FlowNode = QuestionNode | ResultNode;
export type FlowCategory = "Cooling" | "Heating" | "Airflow and water";
export type Flow = { id: string; title: string; summary: string; category: FlowCategory; start: string; nodes: Record<string, FlowNode> };

const q = (prompt: string, answers: Answer[], extra: Omit<QuestionNode, "kind" | "prompt" | "answers"> = {}): QuestionNode => ({ kind: "question", prompt, answers, ...extra });
const r = (title: string, causes: string[], extra: Omit<ResultNode, "kind" | "title" | "causes"> = {}): ResultNode => ({ kind: "result", title, causes, ...extra });
const yes = (next: string): Answer => ({ label: "Yes", next });
const no = (next: string): Answer => ({ label: "No", next });

const LINE_VOLTAGE = "Line voltage is present in the unit. Use rated meter leads and PPE, and lock out power before touching wiring or components.";
const CAPACITOR = "Discharge capacitors before handling them, even with power off.";

export const FLOWS: Flow[] = [
  {
    id: "no-cool-outdoor-off",
    title: "No cooling: outdoor unit not running",
    summary: "Thermostat calling for cool, outdoor unit silent or humming.",
    category: "Cooling",
    start: "call",
    nodes: {
      call: q("Is the thermostat set to Cool, below room temperature, and calling for cooling?", [yes("blower"), no("thermostat")], { detail: "Check the mode, setpoint, any delay or lockout timer on the display, and that it has power." }),
      thermostat: r("Thermostat or setup", ["Mode, setpoint or schedule set wrong", "Thermostat without power (dead batteries, no C wire, blown fuse)", "Compressor delay or lockout timer still counting down"], { checks: ["Correct the setting and wait out any delay (often 5 minutes) before going further."] }),
      blower: q("Is the indoor blower running?", [yes("contactorVolts"), { label: "No", next: "flow:no-blower" }]),
      contactorVolts: q("Is there 24 V across the contactor coil at the outdoor unit?", [yes("pulledIn"), no("indoorY")], { safety: LINE_VOLTAGE }),
      indoorY: q("Is there 24 V between Y and C at the indoor board or terminal strip?", [yes("openToOutdoor"), no("noCall")]),
      openToOutdoor: r("Open in the low-voltage circuit to the outdoor unit", ["Broken or disconnected thermostat wire to the outdoor unit", "Open high- or low-pressure switch wired in the Y circuit", "Condensate float switch opening the Y circuit", "Outdoor control board in lockout"], { checks: ["Trace Y from the indoor terminal to the contactor and check each switch in series.", "If a pressure switch is open, find out why before bypassing it, even briefly."], tools: ["airside", "charge"] }),
      noCall: r("No cooling call reaching the indoor unit", ["Thermostat or thermostat wiring", "Blown fuse on the indoor control board (often from a shorted thermostat wire)", "Failed transformer", "Float switch interrupting R"], { checks: ["Check 24 V at R-C on the board. If the board fuse is blown, find the short before replacing it."], tools: ["airside"] }),
      pulledIn: q("Is the contactor pulled in?", [yes("loadVolts"), no("contactorCoil")]),
      contactorCoil: r("Contactor not closing", ["Open contactor coil", "Contactor mechanically stuck"], { checks: ["With power off, measure coil resistance. Replace the contactor if the coil is open or the armature binds."], tools: ["electrical"] }),
      loadVolts: q("Is line voltage present on the load side of the contactor?", [yes("whatRuns"), no("lineVolts")], { safety: LINE_VOLTAGE }),
      lineVolts: q("Is line voltage present on the line side of the contactor?", [yes("burnedContacts"), no("noPower")], { safety: LINE_VOLTAGE }),
      burnedContacts: r("Burned or pitted contactor contacts", ["Contacts closing but not conducting"], { checks: ["Measure voltage across each closed contact; anything more than a few volts means a bad contact. Replace the contactor and record its condition."], tools: ["electrical"] }),
      noPower: r("No power to the outdoor unit", ["Tripped breaker", "Blown fuses in the disconnect", "Failed disconnect or whip"], { checks: ["If the breaker tripped, find out why before resetting it: check for a grounded compressor and compare the breaker with the nameplate MOCP."], tools: ["electrical", "compressor"] }),
      whatRuns: q("With voltage at the contactor, what runs?", [{ label: "Neither runs", next: "neither" }, { label: "Fan runs, compressor does not", next: "flow:compressor-not-starting" }, { label: "Compressor runs, fan does not", next: "flow:outdoor-fan-not-running" }]),
      neither: q("Are the compressor or fan humming?", [{ label: "Humming", next: "humming" }, { label: "Silent", next: "silent" }], { safety: CAPACITOR }),
      humming: r("Motors humming but not starting", ["Failed run capacitor (most common, often the dual capacitor)", "Locked compressor or seized fan motor"], { checks: ["Test both capacitor sections against the printed rating.", "If the capacitor is good, check compressor windings."], tools: ["electrical", "compressor"] }),
      silent: r("Open circuit after the contactor", ["Broken or burned wire or terminal between the contactor and the motors", "Open compressor internal overload (shell hot)", "Failed common terminal on the dual capacitor"], { checks: ["Look for burned terminals at the contactor and capacitor.", "Check compressor windings; if C-S and C-R read open on a hot compressor, let it cool and retest."], tools: ["compressor", "electrical"] }),
    },
  },
  {
    id: "outdoor-fan-not-running",
    title: "Outdoor fan not running",
    summary: "Compressor runs but the condenser fan does not.",
    category: "Cooling",
    start: "sound",
    nodes: {
      sound: q("Is the fan motor humming, or completely silent?", [{ label: "Humming", next: "freeHum" }, { label: "Silent", next: "voltsAtMotor" }], { safety: `${LINE_VOLTAGE} Keep hands and tools clear of the blade: it can start at any moment.` }),
      freeHum: q("With power off, does the blade spin freely by hand and coast?", [yes("fanCap"), no("seized")], { safety: CAPACITOR }),
      fanCap: r("Weak or failed FAN capacitor section", ["FAN section of the dual capacitor out of tolerance", "Motor windings weakening (less likely)"], { checks: ["Measure the FAN section against its printed rating and tolerance, then measure fan amps against FLA once running."], tools: ["electrical"] }),
      seized: r("Seized fan motor bearings", ["Worn or dry bearings", "Debris binding the blade"], { checks: ["Replace the motor; match rotation, RPM, horsepower and capacitor rating, and check the blade for damage."] }),
      voltsAtMotor: q("Is line voltage reaching the fan motor leads?", [yes("openMotor"), no("noMotorVolts")], { safety: LINE_VOLTAGE }),
      openMotor: r("Fan motor not running with voltage applied", ["Open internal thermal overload (motor hot; let it cool and retest)", "Open motor winding", "Variable-speed (ECM) fan not receiving its control signal"], { checks: ["For an ECM fan, check the control signal and module per the manufacturer before condemning the motor."] }),
      noMotorVolts: r("No voltage at the fan motor", ["Burned wire or terminal at the contactor or capacitor", "Outdoor control board not energizing the fan (variable-speed or defrost board)"], { checks: ["Trace the fan leads back to their source and check for burned terminals."] }),
    },
  },
  {
    id: "compressor-not-starting",
    title: "Compressor will not start",
    summary: "Fan runs; compressor hums, trips, or is silent.",
    category: "Cooling",
    start: "behaviour",
    nodes: {
      behaviour: q("What does the compressor do when called?", [{ label: "Hums, then shuts off", next: "hermCap" }, { label: "Trips the breaker", next: "ground" }, { label: "Silent", next: "hotShell" }], { safety: `${LINE_VOLTAGE} ${CAPACITOR}` }),
      hermCap: q("Is the HERM capacitor section within its printed tolerance?", [yes("windings"), no("badCap")], { tool: "electrical" }),
      badCap: r("Failed run capacitor", ["HERM section out of tolerance"], { checks: ["Replace with the same uF and an equal or higher voltage rating, then measure compressor amps against RLA."], tools: ["electrical"] }),
      windings: q("Do the compressor windings check out (S-R about equal to C-S plus C-R, nothing open or shorted)?", [yes("lockedRotor"), no("badWindings")], { tool: "compressor" }),
      badWindings: r("Compressor winding failure", ["Open or shorted winding"], { checks: ["Confirm with the compressor cool, and record windings and insulation readings before recommending replacement."], tools: ["compressor"] }),
      lockedRotor: r("Compressor not starting with good capacitor and windings", ["Locked rotor (mechanical seizure)", "Low voltage during start", "High head pressure from overcharge, non-condensables, or a dirty condenser coil"], { checks: ["Measure voltage at the compressor during the start attempt.", "Compare inrush with LRA.", "Use a hard-start kit only if the manufacturer allows it."], tools: ["electrical", "charge"] }),
      ground: q("Does any winding read low to ground on a megohmmeter?", [yes("grounded"), no("breaker")], { tool: "compressor" }),
      grounded: r("Grounded compressor", ["Winding insulation failed to the shell"], { safety: "A grounded compressor can energize the shell and piping. Keep the circuit off and locked out.", checks: ["Record the megohm reading. After a burnout, test the oil for acid and plan suction and liquid line driers."], tools: ["compressor"] }),
      breaker: r("Breaker trips without a grounded compressor", ["Weak breaker, or breaker sized wrong for the nameplate", "Locked rotor drawing LRA until the breaker trips", "Shorted wiring"], { checks: ["Compare breaker size with nameplate MOCP and MCA.", "Measure inrush against LRA."], tools: ["electrical"] }),
      hotShell: q("Is the compressor shell very hot to the touch?", [yes("overload"), no("openWinding")]),
      overload: r("Open internal overload", ["Compressor overheated and its internal protector opened"], { checks: ["Let it cool fully (can take an hour or more), or cool it carefully, then retest.", "Find why it overheated: low charge (high superheat), dirty condenser, failed capacitor, or low voltage."], tools: ["charge", "electrical"] }),
      openWinding: q("Do any windings read open with the compressor cool?", [yes("badWindings"), no("openWiring")], { tool: "compressor" }),
      openWiring: r("Open circuit to the compressor", ["Burned compressor terminal or plug", "Broken wire between contactor, capacitor and compressor"], { checks: ["Inspect the compressor terminals for burning; a burned terminal can leak refrigerant and oil."] }),
    },
  },
  {
    id: "poor-cooling",
    title: "Running but not cooling enough",
    summary: "System runs; home will not reach setpoint or air feels warm.",
    category: "Cooling",
    start: "indoorAir",
    nodes: {
      indoorAir: q("Is indoor airflow normal (clean filter, blower at the right speed, coil not iced)?", [{ label: "Filter dirty or coil iced", next: "flow:frozen-coil" }, { label: "Airflow looks normal", next: "condenser" }, { label: "Not sure", next: "measureAir" }], { tool: "airside" }),
      measureAir: r("Measure airflow first", ["Charge readings are unreliable until airflow is right"], { checks: ["Measure total external static and airflow, then come back to this guide."], tools: ["static", "airflow", "airside"] }),
      condenser: q("Is the condenser coil clean and the fan moving plenty of air without recirculating?", [yes("charge"), no("heatRejection")]),
      heatRejection: r("Outdoor heat rejection problem", ["Dirty or blocked condenser coil", "Discharge air recirculating (unit boxed in by shrubs, fences or under a deck)", "Weak fan or wrong blade"], { checks: ["Clean the coil and restore clearance, then recheck head pressure and charge."], tools: ["charge"] }),
      charge: q("What do superheat and subcooling show against the targets?", [
        { label: "High superheat, low subcooling", next: "under" },
        { label: "High superheat, high subcooling", next: "restriction" },
        { label: "Low superheat, high subcooling", next: "over" },
        { label: "Low superheat, low subcooling", next: "lowLow" },
        { label: "Both in range", next: "split" },
      ], { tool: "charge" }),
      under: r("Likely undercharged", ["Refrigerant leak"], { checks: ["Find and repair the leak before adding refrigerant.", "Record refrigerant added and recovered."], tools: ["refrigerantLog", "evacuation"] }),
      restriction: r("Likely restriction or starved metering device", ["Plugged filter drier (temperature drop across it)", "Kinked liquid line", "TXV stuck or underfeeding, or a lost TXV bulb charge"], { checks: ["Measure temperature on both sides of the drier and along the liquid line.", "Check TXV bulb mounting and insulation."] }),
      over: r("Likely overcharged", ["Too much refrigerant", "Non-condensables in the system (also raise head pressure)"], { checks: ["Confirm with the manufacturer charging chart before recovering refrigerant.", "Record refrigerant recovered."], tools: ["refrigerantLog"] }),
      lowLow: r("Low superheat and low subcooling", ["Low airflow across the indoor coil", "Metering device overfeeding", "Inefficient compressor (suction high and head low together)"], { checks: ["Recheck static and airflow. If airflow is right, compare suction and head pressures with the manufacturer's expected values."], tools: ["static", "airflow", "compressor"] }),
      split: q("Is the temperature split across the indoor coil normal for the conditions?", [{ label: "Split is low", next: "lowSplit" }, { label: "Split is normal", next: "load" }], { tool: "airflow" }),
      lowSplit: r("Low split with normal charge readings", ["Compressor not pumping efficiently", "Heat pump reversing valve leaking through", "Measurement error: probe locations"], { checks: ["Recheck probe placement, then compare amps with RLA and suction and head pressures with the chart."], tools: ["electrical", "charge"] }),
      load: r("Equipment working; the house is not", ["Duct leakage or a return pulling from the attic", "Poor attic insulation or high solar gain", "System undersized for the home"], { checks: ["Check duct sizing and leaks, insulation, and a load screening."], tools: ["duct", "insulation", "load"] }),
    },
  },
  {
    id: "frozen-coil",
    title: "Frozen evaporator coil or iced suction line",
    summary: "Ice on the indoor coil, suction line or outdoor service valve.",
    category: "Cooling",
    start: "thaw",
    nodes: {
      thaw: q("Has the coil fully thawed with the blower running and the compressor off?", [yes("airflow"), no("waitThaw")], { detail: "Readings taken on an iced coil are meaningless." }),
      waitThaw: r("Thaw the coil first", ["Diagnosis needs a clean, dry coil"], { checks: ["Set the thermostat to fan on and cooling off. Do not chip ice off the coil. Make sure the drain can handle the melt water."], tools: ["airside"] }),
      airflow: q("Is airflow normal (clean filter and coil, blower on the right speed, static within rating)?", [yes("chargeCheck"), no("lowAir")], { tool: "static" }),
      lowAir: r("Low indoor airflow", ["Dirty filter or evaporator coil", "Blower on too low a speed, or a weak motor or capacitor", "Closed or blocked returns and supplies"], { checks: ["Fix the airflow problem, then recheck charge."], tools: ["airside", "static", "airflow"] }),
      chargeCheck: q("With airflow right, does the charge read low (high superheat, low suction)?", [yes("leak"), no("conditions")], { tool: "charge" }),
      leak: r("Undercharge", ["Refrigerant leak"], { checks: ["Leak search and repair before adding refrigerant."], tools: ["refrigerantLog", "evacuation"] }),
      conditions: q("Does it freeze only when it is cool outside, at night, or with a very low setpoint?", [yes("belowDesign"), no("other")]),
      belowDesign: r("Running below design conditions", ["Very low thermostat setpoint", "Oversized equipment", "Running in low outdoor temperatures without low-ambient control"], { checks: ["Discuss setpoints with the customer. Add low-ambient control only if the manufacturer supports it."] }),
      other: r("Other freezing causes", ["Restriction or metering device problem", "Blower not running whenever the compressor runs (wiring or relay)", "Thermostat fan set to Auto with a slow blower-on delay"], { checks: ["Confirm the blower starts with every cooling call. Check temperature drop across the drier and the TXV."] }),
    },
  },
  {
    id: "no-blower",
    title: "Indoor blower not running",
    summary: "No air from the registers on a call.",
    category: "Airflow and water",
    start: "gCall",
    nodes: {
      gCall: q("Is there 24 V between G and C at the indoor board when the fan is called?", [yes("motorType"), no("noFanCall")], { safety: LINE_VOLTAGE }),
      noFanCall: r("No fan call reaching the board", ["Thermostat or thermostat wiring", "Blown board fuse or failed transformer", "Door safety switch open", "Float switch opening R"], { checks: ["Check 24 V at R-C. If the fuse is blown, find the short first."], tools: ["airside"] }),
      motorType: q("What kind of blower motor is it?", [{ label: "PSC (has a run capacitor)", next: "pscVolts" }, { label: "ECM or variable-speed", next: "ecmVolts" }]),
      pscVolts: q("Is line voltage at the motor leads for the selected speed?", [yes("pscMotor"), no("boardRelay")], { safety: LINE_VOLTAGE }),
      boardRelay: r("Board not powering the motor", ["Failed blower relay on the control board", "Loose or burned speed tap connection"], { checks: ["Verify the board output with the call present before replacing the board."] }),
      pscMotor: q("With power off, what do you find?", [{ label: "Capacitor out of tolerance", next: "blowerCap" }, { label: "Wheel will not turn freely", next: "bound" }, { label: "Both look fine", next: "pscOpen" }], { safety: CAPACITOR }),
      blowerCap: r("Failed blower capacitor", ["Run capacitor below its rating"], { checks: ["Replace with the same uF and an equal or higher voltage rating, then check amps."], tools: ["electrical"] }),
      bound: r("Blower wheel binding", ["Seized motor bearings", "Debris in the wheel or a loose wheel rubbing the housing"], { checks: ["Clean or replace as needed and check the wheel is centred and tight on the shaft."] }),
      pscOpen: r("PSC motor not running with power and a good capacitor", ["Open internal overload (motor hot)", "Open winding"], { checks: ["Let a hot motor cool and retest. Measure winding resistance."] }),
      ecmVolts: q("Is constant line voltage present at the motor power plug?", [yes("ecmSignal"), no("ecmPower")], { safety: `${LINE_VOLTAGE} Wait for ECM capacitors to discharge before unplugging the motor.` }),
      ecmPower: r("No power to the ECM motor", ["Wiring or plug fault", "Door switch or board power feed"], { checks: ["Trace power from the board or terminal block to the motor plug."] }),
      ecmSignal: r("ECM motor has power but does not run", ["Motor not receiving its control signal (24 V taps, PWM or communication)", "Failed motor control module", "Failed motor"], { checks: ["Check the control signal and use the manufacturer's motor tester. Replacing only the module is often possible; do not condemn the motor before checking signal and module."] }),
    },
  },
  {
    id: "furnace-no-heat",
    title: "Gas furnace not heating",
    summary: "Heat call, but no burner flame or no warm air.",
    category: "Heating",
    start: "smell",
    nodes: {
      smell: q("Is there any smell of gas?", [{ label: "Yes", next: "gasSmell" }, { label: "No", next: "heatCall" }]),
      gasSmell: r("Gas odor: stop and make safe", ["Possible gas leak"], { safety: "Do not operate switches or create sparks. Shut off gas if safe to do so, ventilate, get people out if the odor is strong, and follow company procedure and the utility's instructions.", tools: ["gas"] }),
      heatCall: q("Is there 24 V between W and C at the furnace board on a heat call?", [yes("inducer"), no("noHeatCall")], { detail: "Read the board's LED fault code now; it usually points straight at the failed step.", safety: LINE_VOLTAGE }),
      noHeatCall: r("No heat call reaching the furnace", ["Thermostat setting or wiring", "Blown board fuse or failed transformer", "Door safety switch open"], { checks: ["Check 24 V at R-C and the door switch."] }),
      inducer: q("Does the inducer (draft) motor start?", [yes("pressureSwitch"), no("noInducer")]),
      noInducer: r("Inducer not starting", ["Failed inducer motor", "Board not powering the inducer", "Pressure switch stuck closed (some boards will not start the inducer)"], { checks: ["Check voltage to the inducer, and that the pressure switch is open before the inducer runs."] }),
      pressureSwitch: q("Does the pressure switch close with the inducer running?", [yes("igniter"), no("noProve")]),
      noProve: r("Pressure switch not proving", ["Blocked vent or combustion air intake (nests, ice, snow)", "Cracked or water-filled pressure hose", "Blocked condensate trap or flooded collector box (condensing furnace)", "Weak inducer", "Failed switch"], { checks: ["Measure the pressure the inducer creates and compare with the switch rating. Clear vent, intake and condensate paths."], tools: ["airside"] }),
      igniter: q("Does the igniter glow (or spark)?", [yes("burner"), no("noIgnite")]),
      noIgnite: r("No ignition", ["Failed hot surface igniter (check resistance)", "Board not powering the igniter", "Open limit or rollout switch interrupting the sequence"], { checks: ["Measure igniter resistance against the manufacturer's range. Never touch the igniter element; skin oil shortens its life."], tools: ["furnace"] }),
      burner: q("Do the burners light?", [yes("flameHolds"), no("noGas")]),
      noGas: r("Burners not lighting", ["Gas valve not opening (check 24 V at the valve)", "Gas supply off or inlet pressure too low", "Dirty or wrong orifices"], { checks: ["Measure inlet and manifold pressure against the rating plate."], tools: ["gas"] }),
      flameHolds: q("Does the flame stay lit past the trial for ignition (a few seconds)?", [yes("runsThenStops"), no("flameSense")]),
      flameSense: r("Flame not proved", ["Dirty or oxidized flame sensor", "Poor burner ground", "Reversed line voltage polarity", "Flame not carrying over to the sensor burner"], { checks: ["Measure flame signal against the board's minimum. Clean the sensor with a non-abrasive pad and check polarity and ground."], tools: ["gas"] }),
      runsThenStops: q("Does it shut off after running a few minutes?", [{ label: "Yes", next: "flow:furnace-short-cycle" }, { label: "No, but heat is weak", next: "weakHeat" }]),
      weakHeat: r("Running, but heat output is weak", ["Underfiring (low gas pressure or input)", "Too much airflow for the input (rise low)", "Duct leakage"], { checks: ["Measure temperature rise, clock the meter, and check static."], tools: ["furnace", "gas", "static"] }),
    },
  },
  {
    id: "furnace-short-cycle",
    title: "Furnace short cycles or locks out",
    summary: "Burners light, then shut off early or the furnace locks out.",
    category: "Heating",
    start: "rise",
    nodes: {
      rise: q("Is the temperature rise above the nameplate range?", [yes("restriction"), no("cause")], { tool: "furnace" }),
      restriction: q("Is static pressure high or the filter dirty?", [yes("highLimit"), no("overfire")], { tool: "static" }),
      highLimit: r("High-limit trips from low airflow", ["Dirty filter or coil", "Undersized or restricted ductwork", "Blower speed too low for heating"], { checks: ["Fix the restriction, then recheck rise and static."], tools: ["airside", "static", "furnace"] }),
      overfire: r("Rise high with normal static", ["Overfiring (manifold pressure or orifices too large)", "Heating blower speed set too low", "Weak blower motor or capacitor"], { checks: ["Clock the meter and check manifold pressure, then blower speed."], tools: ["gas", "electrical"] }),
      cause: q("What happens when it shuts off?", [{ label: "Flame sensing fault code", next: "flameSensor" }, { label: "Rollout switch trips", next: "rollout" }, { label: "Thermostat satisfies quickly", next: "oversized" }]),
      flameSensor: r("Flame signal dropping out", ["Dirty flame sensor", "Poor ground", "Weak or lifting flame"], { checks: ["Measure flame signal and gas pressures."], tools: ["gas"] }),
      rollout: r("Flame rollout", ["Blocked heat exchanger or flue", "Cracked heat exchanger", "Overfiring"], { safety: "Rollout is a safety condition. Do not reset the switch repeatedly without finding the cause. Check for CO and document the condition.", tools: ["furnace", "gas"] }),
      oversized: r("Short runs from the thermostat", ["Equipment oversized for the home", "Thermostat in a poor location (near a supply register or heat source)", "Thermostat cycle rate set too high"], { checks: ["Check thermostat location and settings; consider a load screening."], tools: ["load"] }),
    },
  },
  {
    id: "heat-pump-not-heating",
    title: "Heat pump not heating or outdoor coil iced",
    summary: "Poor heat in heating mode, or ice building on the outdoor coil.",
    category: "Heating",
    start: "running",
    nodes: {
      running: q("Is the outdoor unit running on a heat call?", [yes("iced"), { label: "No", next: "flow:no-cool-outdoor-off" }]),
      iced: q("Is the outdoor coil fully iced over (more than a light, even frost)?", [yes("defrost"), no("supply")]),
      defrost: q("Force a defrost. What happens?", [{ label: "It does not enter defrost", next: "noDefrost" }, { label: "Enters defrost but the reversing valve does not shift", next: "valve" }, { label: "Defrost works normally", next: "frostCause" }], { tool: "heatpump" }),
      noDefrost: r("Defrost not initiating", ["Failed defrost board or control", "Failed or misplaced defrost sensor or thermostat"], { checks: ["Check the sensor against the manufacturer's resistance chart and its mounting location."], tools: ["heatpump"] }),
      valve: r("Reversing valve not shifting", ["Failed solenoid coil or no voltage to it (O or B terminal)", "Valve stuck"], { checks: ["Check voltage at the solenoid in each mode and coil resistance."], tools: ["heatpump"] }),
      frostCause: r("Heavy frost with working defrost", ["Low charge", "Dirty outdoor coil or weak fan", "Water dripping onto the unit from a gutter or roof"], { checks: ["Check heating charge readings and the outdoor coil and fan."], tools: ["heatpump", "charge"] }),
      supply: q("Is the supply air warm, with a normal heating rise?", [{ label: "Supply air is cool", next: "vapor" }, { label: "Warm, but the house cannot keep up", next: "balance" }], { tool: "heatpump" }),
      vapor: q("Is the large vapor line hot at the indoor coil?", [yes("lowOutput"), no("valve")]),
      lowOutput: r("Heat pump running but low output", ["Low charge", "Reversing valve leaking through"], { checks: ["Check heating subcooling and superheat against the manufacturer's heating chart."], tools: ["heatpump"] }),
      balance: r("Below the balance point", ["Auxiliary heat strips not energizing (sequencer, element, or W2 wiring)", "Heat pump sized near its limit at this outdoor temperature"], { checks: ["Measure heat strip amps and output against the kit rating."], tools: ["heatpump"] }),
    },
  },
  {
    id: "water-leak",
    title: "Water leaking from the indoor unit",
    summary: "Water around the furnace, air handler, or ceiling below an attic unit.",
    category: "Airflow and water",
    start: "drain",
    nodes: {
      drain: q("Is the primary condensate drain flowing freely?", [yes("ice"), no("clog")], { tool: "airside" }),
      clog: r("Blocked condensate drain", ["Algae or debris in the drain line or trap", "Trap missing or dry, letting the blower pull water back (on the return side)"], { checks: ["Clear and flush the drain, prime the trap, and test the overflow safety switch."], tools: ["airside"] }),
      ice: q("Is the coil or suction line iced?", [{ label: "Yes", next: "flow:frozen-coil" }, no("level")]),
      level: q("Is the unit level (or pitched toward the drain) with an intact pan?", [yes("sweat"), no("pan")]),
      pan: r("Pan or pitch problem", ["Unit tilted away from the drain", "Cracked or rusted primary or secondary pan"], { checks: ["Correct the pitch or replace the pan, and record the secondary pan condition."], tools: ["airside"] }),
      sweat: r("Water from somewhere other than the drain", ["Sweating supply plenum or ductwork (missing insulation or air leaks)", "High-efficiency furnace condensate trap or hoses leaking", "Secondary drain routed poorly or blocked"], { checks: ["Check the indoor dew point, duct insulation, and the furnace condensate path."], tools: ["airside", "duct"] }),
    },
  },
];

export const FLOW_IDS = FLOWS.map((f) => f.id);
export function flowById(id: string): Flow | undefined {
  return FLOWS.find((f) => f.id === id);
}
export const FLOW_CATEGORIES: FlowCategory[] = ["Cooling", "Heating", "Airflow and water"];
