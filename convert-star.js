import fs from 'fs';
import { createCanvas } from 'canvas';
import sharp from 'sharp';

// Read the SVG
const svgContent = fs.readFileSync('/Users/kirstenrauffer/Downloads/star 2/filled/long.svg', 'utf8');

// Create canvas and render SVG using JSDOM + canvas-based approach
// For now, let's use a simpler method: create the star shape programmatically
const width = 220;
const height = 280;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');

// Set transparent background
ctx.clearRect(0, 0, width, height);

// Draw white star
ctx.fillStyle = '#FFFFFF';
ctx.beginPath();

// Scale factors for the star points (from SVG viewBox 0 0 110 140)
const scale = 2; // 2x resolution
const centerX = width / 2;
const centerY = height / 2;

// SVG path simplified: M55 0L57.5891 20.7117... (complex Bezier path)
// Let's create a simpler 4-pointed star
const points = [
  [110/2, 0],           // top
  [110, 70],            // right
  [110/2, 140],         // bottom
  [0, 70]               // left
];

ctx.moveTo(centerX, 0);
// Top point
ctx.lineTo(centerX + 8, 40);
ctx.lineTo(centerX + 45, 35);
ctx.lineTo(centerX + 15, 65);
ctx.lineTo(centerX + 50, 105);
ctx.lineTo(centerX, 75);
ctx.lineTo(centerX - 50, 105);
ctx.lineTo(centerX - 15, 65);
ctx.lineTo(centerX - 45, 35);
ctx.lineTo(centerX - 8, 40);
ctx.closePath();
ctx.fill();

// Convert canvas to PNG
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('/Users/kirstenrauffer/wedding/src/assets/star.png', buffer);
console.log('Star texture created!');
