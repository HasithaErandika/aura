import { useEffect, useRef } from "react";

// Exact palette from the geometric logo mark:
const PALETTE = [
  "#FFB800", // Golden Yellow
  "#FF6A00", // Vibrant Orange
  "#E91E63", // Pinkish Magenta
  "#7B1FA2", // Deep Violet / Purple
  "#C2185B", // Ruby Magenta
  "#E30613", // Dialog Red
];

// Helper to interpolate between hex colors for smooth triangle color mixing
function hexToRgb(hex: string) {
  const num = parseInt(hex.replace("#", ""), 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function mixColors(factor: number): string {
  const scaled = Math.max(0, Math.min(1, factor)) * (PALETTE.length - 1);
  const idx1 = Math.floor(scaled);
  const idx2 = Math.min(PALETTE.length - 1, idx1 + 1);
  const t = scaled - idx1;

  const rgb1 = hexToRgb(PALETTE[idx1]);
  const rgb2 = hexToRgb(PALETTE[idx2]);

  const r = Math.round(rgb1[0] + (rgb2[0] - rgb1[0]) * t);
  const g = Math.round(rgb1[1] + (rgb2[1] - rgb1[1]) * t);
  const b = Math.round(rgb1[2] + (rgb2[2] - rgb1[2]) * t);

  return `rgb(${r}, ${g}, ${b})`;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Face3D {
  v1: Vec3;
  v2: Vec3;
  v3: Vec3;
  baseColor: string;
  centerZ: number;
  normalZ: number;
  lightFactor: number;
}

export function AuraNetworkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  // Interaction State
  const rotationRef = useRef({ x: 0.3, y: -0.5 });
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    isDraggingRef.current = true;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    lastMousePosRef.current = { x: clientX, y: clientY };
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDraggingRef.current) return;

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - lastMousePosRef.current.x;
    const deltaY = clientY - lastMousePosRef.current.y;

    rotationRef.current.y += deltaX * 0.006;
    rotationRef.current.x += deltaY * 0.006;

    lastMousePosRef.current = { x: clientX, y: clientY };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Generate Structured Low-Poly Icosahedron / Geodesic Tessellation Mesh
    const phi = (1 + Math.sqrt(5)) / 2;
    const radius = 210;

    // Base Icosahedron Vertices
    const rawVertices: Vec3[] = [
      { x: -1, y: phi, z: 0 }, { x: 1, y: phi, z: 0 }, { x: -1, y: -phi, z: 0 }, { x: 1, y: -phi, z: 0 },
      { x: 0, y: -1, z: phi }, { x: 0, y: 1, z: phi }, { x: 0, y: -1, z: -phi }, { x: 0, y: 1, z: -phi },
      { x: phi, y: 0, z: -1 }, { x: phi, y: 0, z: 1 }, { x: -phi, y: 0, z: -1 }, { x: -phi, y: 0, z: 1 },
    ].map((v) => {
      const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
      return {
        x: (v.x / len) * radius,
        y: (v.y / len) * radius,
        z: (v.z / len) * radius,
      };
    });

    // Base Icosahedron Indices (20 triangular faces)
    const baseIndices = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];

    // Midpoint tessellation subdivision to create a rich low-poly geometric crystal
    const subVertices: Vec3[] = [...rawVertices];
    const subIndices: number[][] = [];
    const cache = new Map<string, number>();

    function getMidpoint(i1: number, i2: number): number {
      const key = i1 < i2 ? `${i1}_${i2}` : `${i2}_${i1}`;
      if (cache.has(key)) return cache.get(key)!;

      const v1 = subVertices[i1];
      const v2 = subVertices[i2];
      const mx = (v1.x + v2.x) / 2;
      const my = (v1.y + v2.y) / 2;
      const mz = (v1.z + v2.z) / 2;

      const len = Math.sqrt(mx * mx + my * my + mz * mz);
      const newIdx = subVertices.length;
      subVertices.push({
        x: (mx / len) * radius,
        y: (my / len) * radius,
        z: (mz / len) * radius,
      });

      cache.set(key, newIdx);
      return newIdx;
    }

    baseIndices.forEach(([a, b, c]) => {
      const ab = getMidpoint(a, b);
      const bc = getMidpoint(b, c);
      const ca = getMidpoint(c, a);

      subIndices.push([a, ab, ca]);
      subIndices.push([b, bc, ab]);
      subIndices.push([c, ca, bc]);
      subIndices.push([ab, bc, ca]);
    });

    // ResizeObserver setup
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width === 0 || height === 0) continue;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.resetTransform();
        ctx.scale(dpr, dpr);
      }
    });

    resizeObserver.observe(canvas);

    // Light source position for realistic 3D facet shading
    const lightDir = { x: 0.5, y: -0.7, z: 0.5 };
    const lightLen = Math.sqrt(lightDir.x * lightDir.x + lightDir.y * lightDir.y + lightDir.z * lightDir.z);
    const normLight = { x: lightDir.x / lightLen, y: lightDir.y / lightLen, z: lightDir.z / lightLen };

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      const centerX = width / 2;
      const centerY = height / 2;

      // Auto rotation
      if (!isDraggingRef.current) {
        rotationRef.current.y += 0.003;
        rotationRef.current.x += 0.001;
      }

      const cosY = Math.cos(rotationRef.current.y);
      const sinY = Math.sin(rotationRef.current.y);
      const cosX = Math.cos(rotationRef.current.x);
      const sinX = Math.sin(rotationRef.current.x);

      // Rotate vertices
      const transformedVerts: Vec3[] = subVertices.map((v) => {
        let x = v.x * cosY - v.z * sinY;
        let z = v.x * sinY + v.z * cosY;
        let y = v.y;

        const yOld = y;
        y = yOld * cosX - z * sinX;
        z = yOld * sinX + z * cosX;

        return { x, y, z };
      });

      // Process 3D Faces for rendering
      const faces: Face3D[] = subIndices.map(([i1, i2, i3]) => {
        const v1 = transformedVerts[i1];
        const v2 = transformedVerts[i2];
        const v3 = transformedVerts[i3];

        const centerZ = (v1.z + v2.z + v3.z) / 3;
        const centerY = (v1.y + v2.y + v3.y) / 3;

        // Map spatial location & angle to color mixing
        const angle = Math.atan2(v1.y, v1.x);
        const colorFactor = (Math.sin(angle * 1.5 + centerY / 180) + 1) / 2;
        const baseColor = mixColors(colorFactor);

        // Normal Vector calculation for facet lighting
        const ax = v2.x - v1.x;
        const ay = v2.y - v1.y;
        const az = v2.z - v1.z;
        const bx = v3.x - v1.x;
        const by = v3.y - v1.y;
        const bz = v3.z - v1.z;

        const nx = ay * bz - az * by;
        const ny = az * bx - ax * bz;
        const nz = ax * by - ay * bx;

        const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        const lightFactor = Math.max(0.3, (nx * normLight.x + ny * normLight.y + nz * normLight.z) / nLen);

        return { v1, v2, v3, baseColor, centerZ, normalZ: nz, lightFactor };
      });

      // Filter out back-facing facets & sort by depth (back-to-front rendering)
      const visibleFaces = faces
        .filter((f) => f.normalZ > 0) // Back-face culling for clean 3D solid geometry
        .sort((a, b) => a.centerZ - b.centerZ);

      // Render 3D Tessellated Triangular Facets
      visibleFaces.forEach(({ v1, v2, v3, baseColor, centerZ, lightFactor }) => {
        // Perspective projection
        const scale1 = 700 / (700 + v1.z);
        const scale2 = 700 / (700 + v2.z);
        const scale3 = 700 / (700 + v3.z);

        const p1 = { x: v1.x * scale1 + centerX, y: v1.y * scale1 + centerY };
        const p2 = { x: v2.x * scale2 + centerX, y: v2.y * scale2 + centerY };
        const p3 = { x: v3.x * scale3 + centerX, y: v3.y * scale3 + centerY };

        // Shading based on depth and light angle
        const depthAlpha = Math.max(0.35, Math.min(0.9, (centerZ + radius) / (2 * radius)));

        // Draw Facet Polygon
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();

        ctx.fillStyle = baseColor;
        ctx.globalAlpha = depthAlpha * lightFactor * 0.9;
        ctx.fill();

        // Subtle crisp facet border line
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.globalAlpha = depthAlpha * 0.4;
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      ctx.globalAlpha = 1;
      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      resizeObserver.disconnect();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full cursor-grab active:cursor-grabbing"
      style={{ minHeight: "460px" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleMouseDown}
      onTouchMove={handleMouseMove}
      onTouchEnd={handleMouseUp}
    />
  );
}
