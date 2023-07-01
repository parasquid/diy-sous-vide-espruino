const SCL = D18;
const SDA = D19;
const RF_DATA = D16;
const ROT_SW = D14;
const ROT_DT = D15;
const ROT_CLK = D20;
const OW_DATA = D25;

pinMode(ROT_CLK, "input");
pinMode(ROT_DT, "input");
pinMode(ROT_SW, "input_pullup");

I2C1.setup({ scl: SCL, sda: SDA, bitrate: 10000000 });
var g = require("SSD1306").connect(I2C1, start);

var ow = new OneWire(OW_DATA);
var sensor = require("DS18B20").connect(ow);

var sw = require("RcSwitch").connect(1, RF_DATA, 10);

var state = {
  led: true,
  currentTemp: 0,
  prevTemp: 0,
  setTemp: 0,
  offset: 53,
  isRelayOn: false,
  isRunning: false,
  dirty: false,
  relayOffCommand: 0,
  kp: 1,
  ki: 0,
  kd: 4,
  lastError: 0,
  integral: 0,
  derivative: 0,
};

function start() {
  // write some text
  g.clear();
  g.setFontVector(10);
  g.drawString("Let's", 0, 0); // 40px high in red
  g.setFontVector(20);
  g.drawString("Cook!", 40, 40); // 60px high in green
  // write to the screen
  g.flip();
}

function getActualSetTemp(temp, offset) {
  // "jit";
  return Math.floor(temp) + offset;
}

function drawState(display, obj) {
  // "jit";
  const size = 8;
  const dblSize = size * 2;
  var relayText;
  if (obj.isRunning) {
    if (obj.isRelayOn) relayText = "on";
    else relayText = "off";
  } else relayText = "paused";

  const line1 = "cur: " + obj.currentTemp;
  const line2 = "set: " + getActualSetTemp(obj.setTemp, obj.offset);
  const line3 = "pid: " + obj.pidOutput;
  const line4 = "relay: " + relayText;

  display.clear();
  display.setFontVector(dblSize);
  display.drawString(line1, 0, size * 0);
  display.drawString(line2, 0, size * 2);
  display.setFontVector(size);
  display.drawString(line3, 0, size * 5);
  display.drawString(line4, 0, size * 6);
  display.flip();
  // console.log(state);
}

function updateStateTask() {
  "jit";
  if (state.dirty) {
    drawState(g, state);
    state.dirty = false;
  }
}

function ledTask() {
  // "jit";
  state.led = !state.led;
  digitalWrite(LED1, state.led);
}

function getTempCallback(temp) {
  // "jit";
  if (temp) state.currentTemp = temp;
  if (state.currentTemp != state.prevTemp) state.dirty = true;
}

function buttonTask() {
  // "jit";
  state.isRunning = !state.isRunning;
  // if (state.isRunning) sw.send(state.relayOffCommand + 8, 24);
  // else sw.send(state.relayOffCommand, 24);
  state.dirty = true;
}

var a0 = 0;
var c0 = 0;
function handler() {
  "compiled";
  var a = ROT_DT.read();
  var b = ROT_CLK.read();
  if (a != a0) {
    // A changed
    a0 = a;
    if (b != c0) {
      c0 = b;
      var incr = a == b ? 1 : -1;
      state.setTemp += incr;
      state.dirty = true;
    }
  }
}
setWatch(handler, ROT_DT, { repeat: true, edge: "both", irq: true });
setWatch(handler, ROT_CLK, { repeat: true, edge: "both", irq: true });

function pid(stateObj) {
  // "jit";
  const dt = getTime() - stateObj.lastTime;
  stateObj.lastTime = getTime();

  error =
    getActualSetTemp(stateObj.setTemp, stateObj.offset) - stateObj.currentTemp;
  stateObj.integral = stateObj.integral + error * dt;
  stateObj.derivative = (error - stateObj.lastError) / dt;

  stateObj.lastError = error;
  p_term = stateObj.kp * stateObj.lastError;
  i_term = stateObj.ki * stateObj.integral;
  d_term = stateObj.kd * stateObj.derivative;

  output = p_term + i_term + d_term;
  stateObj.pidOutput = output;

  return stateObj;
}
function pidTask() {
  if (state.isRunning) {
    state = pid(state);
    state.dirty = true;
  } else {
    // also pause the error correction
    state.lastTime = getTime();
  }
}

function switchRelayOff() {
  // "jit";
  sw.send(state.relayOffCommand, 24);
  return false;
}

function switchRelayOn() {
  // "jit";
  sw.send(state.relayOffCommand + 8, 24);
  return true;
}

function relayTask() {
  if (state.isRunning) {
    if (state.pidOutput < 0) {
      state.isRelayOn = switchRelayOff();
    } else {
      state.isRelayOn = switchRelayOn();
    }
  }
}

// set the relay off when we start
switchRelayOff();

setInterval(updateStateTask, 20);
setInterval(function () {
  sensor.getTemp(getTempCallback);
  pidTask();
  relayTask();
  ledTask();
  updateStateTask();
}, 1000);
setWatch(buttonTask, ROT_SW, { repeat: true, edge: "rising", debounce: 50 });
