const OW_DATA = D11;
const ROT_SW = D14;
const ROT_DT = D15;
const ROT_CLK = D16;
const SDA = D19;
const SCL = D20;
const RF_DATA = D25;
// see https://www.instructables.com/433-MHz-Coil-loaded-antenna/
const BUZZER = D29;

var state = {
  led: true,
  currentTemp: 0,
  prevTemp: 0,
  setTemp: 0,
  offset: 53,
  isRelayOn: false,
  isRunning: false,
  dirty: false,
  relayOffCommand: 15559956,
  kp: 1,
  ki: 0,
  kd: 4,
  lastError: 0,
  integral: 0,
  derivative: 0,
  lastMessage: "",
};

pinMode(ROT_CLK, "input");
pinMode(ROT_DT, "input");
pinMode(ROT_SW, "input_pullup");

function start() {
  // write some text
  g.clear();
  g.setFontVector(10);
  g.drawString("Let's", 0, 0); // 40px high in red
  g.setFontVector(20);
  g.drawString("Cook!", 40, 40); // 60px high in green
  // write to the screen
  g.flip();

  analogWrite(BUZZER, 0.5, { freq: 532.25 });
  setTimeout(() => {
    analogWrite(BUZZER, 0.5, { freq: 392 });
    setTimeout(() => {
      digitalWrite(BUZZER, 0);
      analogWrite(BUZZER, 0.5, { freq: 392 });
      setTimeout(() => {
        analogWrite(BUZZER, 0.5, { freq: 523.25 });
        setTimeout(() => digitalWrite(BUZZER, 0), 100);
      }, 100);
    }, 100);
  }, 100);
}

// adapted from rcswitch https://www.espruino.com/modules/RcSwitch.js
function rfSend(value, length) {
  var signal = [];

  for (var i = length - 1; i >= 0; i--) {
    if (value & (1 << i)) {
      signal.push(1.05);
      signal.push(0.35);
    } else {
      signal.push(0.35);
      signal.push(1.05);
    }
  }
  signal.push(0.35);
  signal.push(10.85);

  for (var nRepeat = 0; nRepeat < 3; nRepeat++) {
    digitalPulse(RF_DATA, 1, signal);
  }
}

I2C1.setup({ scl: SCL, sda: SDA, bitrate: 10000000 });
var g = require("SSD1306").connect(I2C1, start);

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
  display.drawString(state.lastMessage, 0, size * 7);
  display.flip();
  // console.log(state);
}

function msg(message) {
  state.lastMessage = message;
  drawState(g, state);
}
function updateStateTask() {
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
  state.isRunning = !state.isRunning;
  // if (state.isRunning) sw.send(state.relayOffCommand + 8, 24);
  // else sw.send(state.relayOffCommand, 24);
  state.dirty = true;
  updateStateTask();
}
setWatch(buttonTask, ROT_SW, {
  repeat: true,
  edge: "rising",
  debounce: 25,
});

var a0 = 0;
var c0 = 0;
function encoderHandler() {
  "compiled";
  var a = ROT_DT.read();
  var b = ROT_CLK.read();
  if (a != a0) {
    // A changed
    a0 = a;
    if (b != c0) {
      c0 = b;
      var incr = a == b ? 1 : -1;
      encoderTask(incr);
    }
  }
}
setWatch(encoderHandler, ROT_DT, { repeat: true, edge: "both", irq: true });

function encoderTask(direction) {
  state.setTemp += direction;
  state.dirty = true;
}

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
  rfSend(state.relayOffCommand, 24);
  return false;
}

function switchRelayOn() {
  // "jit";
  rfSend(state.relayOffCommand + 8, 24);
  return true;
}

function relayTask() {
  if (state.isRunning) {
    if (state.pidOutput < 0) {
      if (state.isRelayOn) {
        analogWrite(BUZZER, 0.5, { freq: 532.25 });
        setTimeout(() => {
          analogWrite(BUZZER, 0.5, { freq: 392 });
          setTimeout(() => digitalWrite(BUZZER, 0), 100);
        }, 100);
      }
      state.isRelayOn = switchRelayOff();
    } else {
      if (!state.isRelayOn) {
        analogWrite(BUZZER, 0.5, { freq: 392 });
        setTimeout(() => {
          analogWrite(BUZZER, 0.5, { freq: 523.25 });
          setTimeout(() => digitalWrite(BUZZER, 0), 100);
        }, 100);
      }
      state.isRelayOn = switchRelayOn();
    }
  } else {
    state.isRelayOn = switchRelayOff();
  }
}

var ow = new OneWire(OW_DATA);
var sensor = require("DS18B20").connect(ow);

setInterval(updateStateTask, 200);
setInterval(function () {
  sensor.getTemp(getTempCallback);
  pidTask();
  ledTask();
  updateStateTask();
}, 1000);
setInterval(relayTask, 250);
switchRelayOff();
