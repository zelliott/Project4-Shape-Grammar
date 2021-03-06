const THREE = require('three');
const ML = require('three.meshline');
const _ = require('lodash');

export default class City {
  constructor(scene, shapeGrammar) {
    this.scene = scene;

    this.baseDim = 200;
    this.baseDiagonal = Math.sqrt((2 * Math.pow(this.baseDim / 2, 2)));
    this.base = null;

    this.numRings = 4;
    this.ringPoints = 32;
    this.ringWidth = 4;

    this.numDivisions = 12;
    this.ringDivisions = [];
    this.divisionWidth = this.ringWidth;

    this.riverPoints = 32;

    this.cellDim = 7;
    this.cells = [];

    this.shapeGrammar = shapeGrammar;

    this.baseColor = 0x15938;
    this.streetColor = 0x031923;
  }

  renderBase() {
    var geometry = new THREE.PlaneGeometry(this.baseDim, this.baseDim, 32);
    var material = new THREE.MeshLambertMaterial({ color: this.baseColor, side: THREE.DoubleSide });
    var mesh = new THREE.Mesh(geometry, material);

    mesh.receiveShadow = true;
    mesh.translateZ(-0.1);

    this.scene.add(mesh);
    this.base = geometry;
  }

  renderRings() {
    var delta = (this.baseDim / 2) / this.numRings;
    var radius = this.baseDim / 2;

    for (var i = 0; i < this.numRings; i++) {
      var path = new THREE.Path();

      path.absellipse(0, 0, radius, radius, 0, 2 * Math.PI);

      var points = _.map(path.getPoints(this.ringPoints), p => {
        return new THREE.Vector3(p.x, p.y, 0);
      });

      this.renderLine(points);
      this.renderRing(radius);

      this.ringDivisions.push({
        id: i,
        radius: radius,
        divisions: [],
        segments: [],
        points: points
      });

      radius -= delta;
    }
  }

  renderDivisions() {
    var pos = new THREE.Vector3(0, this.baseDim / 2, 0);
    var theta = (2 * Math.PI) / this.numDivisions;
    var i = 0;

    for (var i = 0; i < this.numDivisions; i++) {
      var rand = THREE.Math.randInt(0, this.numRings);
      var z = new THREE.Vector3(0, 0, 1);

      for (var j = 0; j < rand; j++) {
        var ringDivision = this.ringDivisions[j];
        var ratio = 0.75;

        var pA = pos.clone();
        var pB = pos.clone();

        pA.multiplyScalar(1 - (j / this.numRings));
        pB.multiplyScalar(1 - ((j + 1) / this.numRings));

        var points = [ pA, pB ];

        this.renderLine(points);
        this.renderDivision(pA, pB, theta * i);

        ringDivision.divisions.push({
          pA: pA,
          pB: pB,
          theta: theta * i,
        });
      }

      pos.applyAxisAngle(z, theta);
    }

    for (var i = 0; i < this.numRings; i++) {
      var ringDivision = this.ringDivisions[i];
      var divisions = ringDivision.divisions;

      for (var j = 0; j < divisions.length; j++) {
        var divisionA = divisions[j];
        var divisionB = divisions[(j + 1) % divisions.length];

        var xs = [ divisionA.pA.x, divisionA.pB.x, divisionB.pA.x, divisionB.pB.x ];
        var ys = [ divisionA.pA.y, divisionA.pB.y, divisionB.pA.y, divisionB.pB.y ];

        var minX = _.min(xs);
        var maxX = _.max(xs);
        var minY = _.min(ys);
        var maxY = _.max(ys);

        var min = new THREE.Vector2(minX, minY);
        var max = new THREE.Vector2(maxX, maxY);

        ringDivision.segments.push({
          bbox: new THREE.Box2(min, max)
        });
      }
    }
  }

  renderCells() {

    var halfDim = this.baseDim / 2;
    var epsilon = this.cellDim;
    var threshold = 1;

    for (var x = -halfDim; x < halfDim; x += this.cellDim) {
      for (var y = -halfDim; y < halfDim; y += this.cellDim) {

        var pos = new THREE.Vector3();
        pos.x = x;
        pos.y = y;
        pos.z = 0;

        var draw = true;
        for (var i = 0; i < this.numRings; i++) {
          var radius = this.ringDivisions[i].radius;

          if (Math.abs(pos.length() - radius) < epsilon) {
            draw = false;
          }

          var divisions = this.ringDivisions[i].divisions;

          for (var j = 0; j < divisions.length; j++) {
            var division = divisions[j];
            var pA = division.pA;
            var pB = division.pB;

            var distance = pA.distanceTo(pB);
            var posDistance = pos.distanceTo(pA) + pos.distanceTo(pB);

            if (posDistance - distance < threshold) {
              draw = false;
            }
          }
        }

        if (halfDim - Math.abs(pos.x) < 5) {
          draw = false;
        }

        if (halfDim - Math.abs(pos.y) < 5) {
          draw = false;
        }

        if (draw) {
          this.cells.push({
            pos: pos,
            density: 1 - (pos.length() / this.baseDiagonal),
            color: THREE.Math.randInt(0, 1)
          });
        }
      }
    }
  }

  renderRiver() {
    var points = [];
    var borderPoints = this.generateBorderPoints(2);

    points.push(borderPoints[0]);

    var x = this.getRandSpread();
    var y = this.getRandSpread();

    points.push(new THREE.Vector3(x, y, 0));
    points.push(borderPoints[1]);

    var river = new THREE.CatmullRomCurve3(points);

    this.renderLine(river.getPoints(this.riverPoints));
  }

  renderBuildings() {
    for (var i = 0; i < this.cells.length; i++) {
      var cell = this.cells[i];

      if (i % 2 == 0) {
        continue;
      }

      this.shapeGrammar.setState(cell);
      this.shapeGrammar.render();
    }
  }

  renderRing(radius) {
    var halfWidth = (this.ringWidth / 2);
    var geometry = new THREE.RingGeometry(radius - halfWidth, radius + halfWidth, this.ringPoints);
    var material = new THREE.MeshBasicMaterial({ color: this.streetColor, side: THREE.DoubleSide });
    var mesh = new THREE.Mesh(geometry, material);

    this.scene.add(mesh);
  }

  renderDivision(pointA, pointB, theta) {
    var epsilon = 1;
    var width = this.divisionWidth;
    var height = (this.baseDim / (2 * 4)) + this.divisionWidth - epsilon;

    var geometry = new THREE.PlaneGeometry(width, height, 32);
    var material = new THREE.MeshBasicMaterial({ color: this.streetColor, side: THREE.DoubleSide });
    var mesh = new THREE.Mesh(geometry, material);

    this.scene.add(mesh);

    var midPoint = pointA.clone();
    midPoint.add(pointB);
    midPoint.multiplyScalar(0.5);

    mesh.translateX(midPoint.x);
    mesh.translateY(midPoint.y);
    mesh.rotateZ(theta);
  }

  renderLine(points) {
    var geometry = new THREE.Geometry();

    geometry.vertices = points;

    var material = new THREE.LineBasicMaterial({ color: this.streetColor });
    var mesh = new THREE.Line(geometry, material);

    this.scene.add(mesh);
  }

  generateBorderPoints(n) {
    var points = [];

    for (var i = 0; i < n; i++) {
      var p = new THREE.Vector3();
      var rand1 = THREE.Math.randInt(0, 3);
      var rand2 = this.getRandSpread();

      if (rand1 < 2) {
        p.y = rand2;
      } else {
        p.x = rand2;
      }

      switch (rand1) {
        case 0:
          p.x = this.baseDim / -2;
          break;
        case 1:
          p.x = this.baseDim / 2;
          break;
        case 2:
          p.y = this.baseDim / -2;
          break;
        case 3:
          p.y = this.baseDim / 2;
          break;
        default:
          break;
      }

      points.push(p);

    }

    return points;
  }

  getRandSpread() {
    return THREE.Math.randFloatSpread(this.baseDim);
  }

  clearBuildings() {
    this.scene.traverseVisible(function(child) {
      if (child.type !== 'Scene' && child.name === 'building') {
        this.scene.remove(child);
      }
    });
  }
};