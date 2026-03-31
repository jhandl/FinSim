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
        if (!ann) continue;
        if (ann.type === 'label') {
          const x = ann.pixel;
          const y = ann.y;
          const content = ann.content;
          if (!isFinite(x) || !isFinite(y) || !content) continue;
          const padding = 4;
          const font = ann.font || {};
          const fontSize = font.size || 11;
          const fontFamily = font.family || 'Inter, sans-serif';
          const fontStyle = font.style || 'normal';
          const text = String(content);
          ctx.save();
          ctx.font = fontStyle + ' ' + fontSize + 'px ' + fontFamily;
          const textWidth = ctx.measureText(text).width;
          ctx.fillStyle = ann.backgroundColor || 'rgba(255,255,255,0.9)';
          ctx.fillRect(x + padding, y, textWidth + padding * 2, fontSize + padding * 2);
          ctx.fillStyle = ann.color || '#666';
          ctx.textBaseline = 'top';
          ctx.fillText(text, x + padding * 2, y + padding);
          ctx.restore();
          continue;
        }
        if (ann.type !== 'line') continue;

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

  const spikeLabelsPlugin = {
    id: 'spikeLabels',
    afterDatasetsDraw(chart) {
      const spikes = chart.$spikeAnnotations;
      if (!spikes || !chart.chartArea) return;
      const ctx = chart.ctx;
      const chartArea = chart.chartArea;
      const xScale = chart.scales && chart.scales.x;
      if (!xScale) return;

      const PADDING = 4;
      const FONT_SIZE = 11;
      const LINE_HEIGHT = FONT_SIZE + PADDING * 2 + 2;
      const X_OFFSET = 4;

      for (let i = 0; i < spikes.length; i++) {
        const spike = spikes[i];
        let x = NaN;
        if (xScale && typeof xScale.getPixelForValue === 'function') {
          x = xScale.getPixelForValue(spike.index);
        }
        if (!isFinite(x) && chart.getDatasetMeta && chart.data && chart.data.datasets) {
          for (let d = 0; d < chart.data.datasets.length; d++) {
            const meta = chart.getDatasetMeta(d);
            const point = meta && meta.data && meta.data[spike.index];
            if (point && isFinite(point.x)) {
              x = point.x;
              break;
            }
          }
        }
        if (!isFinite(x)) continue;

        let yOffset = chartArea.top + PADDING;

        for (let j = 0; j < spike.entries.length; j++) {
          const entry = spike.entries[j];
          ctx.save();
          ctx.font = 'normal ' + FONT_SIZE + 'px Inter, sans-serif';
          const textWidth = ctx.measureText(entry.text).width;
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.fillRect(x + PADDING + X_OFFSET, yOffset, textWidth + PADDING * 2, LINE_HEIGHT);
          ctx.fillStyle = entry.color;
          ctx.textBaseline = 'top';
          ctx.fillText(entry.text, x + PADDING * 2 + X_OFFSET, yOffset + PADDING);
          ctx.restore();
          yOffset += LINE_HEIGHT + 2;
        }
      }
    }
  };

  Chart.register(annotationPlugin);
  Chart.register(spikeLabelsPlugin);
})(this, this.Chart);
