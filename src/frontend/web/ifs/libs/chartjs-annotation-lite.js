/* Lightweight annotation plugin to support vertical relocation markers. */
(function factory(root, Chart) {
  if (!Chart) {
    return;
  }

  const annotationPlugin = {
    id: 'relocationMarkers',
    afterDraw(chart) {
      const annotations = chart.$relocationAnnotations;
      const ctx = chart.ctx;
      const chartArea = chart.chartArea;
      if (!chartArea || !annotations) return;

      const keys = Object.keys(annotations);
      for (let i = 0; i < keys.length; i++) {
        const ann = annotations[keys[i]];
        if (!ann || ann.type !== 'line') continue;

        const x = ann.pixel;
        if (!isFinite(x)) continue;

        const borderColor = ann.borderColor || '#ccc';
        const borderWidth = ann.borderWidth != null ? ann.borderWidth : 1;
        const borderDash = ann.borderDash || [5, 5];

        ctx.save();
        ctx.lineWidth = borderWidth;
        ctx.strokeStyle = borderColor;
        if (borderDash && ctx.setLineDash) ctx.setLineDash(borderDash);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.restore();

        const label = ann.label || {};
        if (!label.enabled || !label.content) continue;

        const padding = label.padding != null ? label.padding : 4;
        const font = label.font || {};
        const fontSize = font.size || 11;
        const fontFamily = font.family || 'Inter, sans-serif';
        const fontStyle = font.style || 'normal';
        const content = String(label.content);

        ctx.save();
        ctx.font = fontStyle + ' ' + fontSize + 'px ' + fontFamily;
        const textWidth = ctx.measureText(content).width;
        const textHeight = fontSize;
        const background = label.backgroundColor || 'rgba(255,255,255,0.9)';
        const color = label.color || '#666';

        let y = chartArea.top + padding + textHeight;
        if (label.position === 'bottom') {
          y = chartArea.bottom - padding;
        }

        const rectX = x + padding;
        const rectY = y - textHeight - padding;
        const rectWidth = textWidth + padding * 2;
        const rectHeight = textHeight + padding * 2;

        ctx.fillStyle = background;
        ctx.fillRect(rectX - padding, rectY, rectWidth, rectHeight);
        ctx.fillStyle = color;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(content, rectX, y);
        ctx.restore();
      }
    }
  };

  Chart.register(annotationPlugin);
})(this, this.Chart);
