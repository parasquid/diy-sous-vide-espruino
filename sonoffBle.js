// aa6b
var g;
function drawState() {
  if (!g) return;
  g.clear();
  // write some text
  g.drawString("Sonoff BLE!", 2, 2);
  g.drawString("", 0, 10);

  // write to the screen
  g.flip();
  console.log(on);
}

function onInit() {
  I2C1.setup({ scl: D45, sda: D44, bitrate: 1000000 });
  setTimeout(function () {
    g = require("SSD1306").connect(I2C1, drawState, { height: 32 });
  }, 1000);
}

var on = false;
setInterval(function () {
  on = !on;
  //D47.write(on);
  LED1.write(on);
  drawState();
}, 500);

NRF.setServices({
  0x1815: {
    0x2ae2: {
      writable: true,
      maxLen: 1,
      value: [false],
      onWrite: function (evt) {
        var n = evt.data[0];
        D47.write(n);
      },
    },
  },
});

// On disconnect, stop the servo
NRF.on("disconnect", function () {
  D47.write(false);
});

NRF.setAdvertising({}, { name: "Sonoff BLE" });
