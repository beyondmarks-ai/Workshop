"use client";

import { useEffect, useRef } from "react";

export default function GravityStarsBackground({
  starsCount = 75,
  starsSize = 2,
  starsOpacity = 0.75,
  glowIntensity = 15,
  glowAnimation = "ease",
  movementSpeed = 0.3,
  mouseInfluence = 100,
  mouseGravity = "attract",
  gravityStrength = 75,
  starsInteraction = false,
  starsInteractionType = "bounce",
  className = ""
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const stars = [];
    const mouse = { x: 0, y: 0, active: false };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lowPowerDevice = (navigator.hardwareConcurrency || 4) <= 4 || navigator.connection?.saveData;
    let frame;
    let width;
    let height;
    let lastFrame = 0;

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, lowPowerDevice ? 1 : 1.5);
      width = rect.width;
      height = rect.height;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const areaLimit = Math.max(55, Math.min(lowPowerDevice ? 110 : 240, Math.round(width * height / 8500)));
      const targetCount = Math.min(Math.max(0, Math.floor(starsCount)), areaLimit);
      if (stars.length > targetCount) stars.length = targetCount;
      for (let i = stars.length; i < targetCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = movementSpeed * (0.5 + Math.random() * 0.5);
        stars.push({ x: Math.random() * width, y: Math.random() * height, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: Math.random() * starsSize + 1, opacity: starsOpacity, glow: 1 });
      }
    };

    const move = (event) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
      mouse.active = mouse.x >= 0 && mouse.x <= width && mouse.y >= 0 && mouse.y <= height;
    };

    const leave = () => { mouse.active = false; };

    const draw = (moveStars = true) => {
      context.clearRect(0, 0, width, height);
      context.shadowColor = "#9ecfff";
      context.shadowBlur = lowPowerDevice ? Math.min(glowIntensity, 6) : Math.min(glowIntensity, 10);
      for (let index = 0; index < stars.length; index++) {
        const star = stars[index];
        const dx = mouse.active ? mouse.x - star.x : 0;
        const dy = mouse.active ? mouse.y - star.y : 0;
        const distanceSquared = dx * dx + dy * dy;
        if (mouse.active && distanceSquared < mouseInfluence * mouseInfluence && distanceSquared > 0) {
          const distance = Math.sqrt(distanceSquared);
          const force = (mouseInfluence - distance) / mouseInfluence;
          const gravity = force * gravityStrength * 0.001;
          const direction = mouseGravity === "repel" ? -1 : 1;
          star.vx += dx / distance * gravity * direction;
          star.vy += dy / distance * gravity * direction;
          star.opacity = Math.min(1, starsOpacity + force * 0.4);
          star.glow += (1 + force * 2 - star.glow) * (glowAnimation === "instant" ? 1 : 0.12);
        } else {
          star.opacity += (starsOpacity - star.opacity) * 0.08;
          star.glow += (1 - star.glow) * (glowAnimation === "instant" ? 1 : 0.08);
        }

        if (starsInteraction) { // ponytail: O(n²) star collision scan; spatial indexing if star counts grow.
          for (let otherIndex = index + 1; otherIndex < stars.length; otherIndex++) {
            const other = stars[otherIndex];
            const separationX = other.x - star.x;
            const separationY = other.y - star.y;
            const separation = Math.hypot(separationX, separationY);
            const minimum = star.size + other.size + 5;
            if (separation >= minimum || separation === 0) continue;
            if (starsInteractionType === "merge") {
              star.vx += separationX * 0.0005;
              star.vy += separationY * 0.0005;
            } else {
              star.vx -= separationX * 0.01;
              star.vy -= separationY * 0.01;
              other.vx += separationX * 0.01;
              other.vy += separationY * 0.01;
            }
          }
        }

        if (moveStars) {
          star.x += star.vx;
          star.y += star.vy;
          star.vx *= 0.999;
          star.vy *= 0.999;
          if (star.x < 0) star.x = width;
          if (star.x > width) star.x = 0;
          if (star.y < 0) star.y = height;
          if (star.y > height) star.y = 0;
        }
        context.beginPath();
        context.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
        context.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        context.fill();
      }
    };

    const animate = (timestamp) => {
      if (document.hidden) return;
      const interval = lowPowerDevice ? 1000 / 30 : 1000 / 60;
      if (timestamp - lastFrame >= interval) {
        lastFrame = timestamp;
        draw(true);
      }
      frame = requestAnimationFrame(animate);
    };

    const visibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && !reducedMotion) {
        lastFrame = 0;
        frame = requestAnimationFrame(animate);
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement);
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerleave", leave, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    if (reducedMotion) draw(false);
    else frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [starsCount, starsSize, starsOpacity, glowIntensity, glowAnimation, movementSpeed, mouseInfluence, mouseGravity, gravityStrength, starsInteraction, starsInteractionType]);

  return <div className={className} aria-hidden="true"><canvas ref={canvasRef} /></div>;
}
