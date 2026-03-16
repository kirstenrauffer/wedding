import { createCanvas } from 'canvas';
import fs from 'fs';
import { DOMParser } from '@xmldom/xmldom';

// Read the SVG
const svgString = fs.readFileSync('/Users/kirstenrauffer/Downloads/star 2/filled/long.svg', 'utf8');

// Parse SVG dimensions
const parser = new DOMParser();
const doc = parser.parseFromString(svgString, 'application/xml');
const svg = doc.documentElement;
const width = parseInt(svg.getAttribute('width')) * 2; // 2x for better quality
const height = parseInt(svg.getAttribute('height')) * 2;

// Create canvas with transparent background
const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');

// Clear to transparent
ctx.clearRect(0, 0, width, height);

// Draw white star
ctx.fillStyle = 'white';
ctx.globalAlpha = 1.0;

// Get the path from SVG and scale it
const path = svg.getElementsByTagName('path')[0];
const pathData = path.getAttribute('d');

// Create path from SVG path data (simplified parsing)
const p = new Path2D(pathData);

// Scale the path for 2x resolution
ctx.scale(2, 2);
ctx.fill(p);

// Convert to PNG buffer
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('/Users/kirstenrauffer/wedding/src/assets/star.png', buffer);
console.log('✓ Star PNG created with transparency');
