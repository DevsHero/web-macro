async function waitForPageReady(page) {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
  } catch (_error) {
    // Ignore slow page loads.
  }
}

async function locateGameCanvas(page) {
  await waitForPageReady(page);

  async function pickLargestCanvas(target, frameRef) {
    const candidates = await target.$$('canvas');
    let best = null;

    for (const canvasHandle of candidates) {
      const box = await canvasHandle.boundingBox();
      if (!box || box.width < 2 || box.height < 2) {
        continue;
      }

      const area = box.width * box.height;
      if (!best || area > best.area) {
        best = {
          area,
          canvasHandle,
          frame: frameRef,
        };
      }
    }

    return best;
  }

  const timeoutMs = 8000;
  const pollMs = 180;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    let bestCanvas = await pickLargestCanvas(page, null);

    for (const frame of page.frames()) {
      const frameCandidate = await pickLargestCanvas(frame, frame);
      if (!frameCandidate) {
        continue;
      }

      if (!bestCanvas || frameCandidate.area > bestCanvas.area) {
        bestCanvas = frameCandidate;
      }
    }

    if (bestCanvas) {
      return {
        frame: bestCanvas.frame,
        canvasHandle: bestCanvas.canvasHandle,
      };
    }

    await page.waitForTimeout(pollMs);
  }

  return null;
}

// Follow only the active frame chain, including open shadow roots. Looking at
// every frame would pick up stale focus remembered by an inactive iframe.
async function hasFocusedEditable(page) {
  let frame = page.mainFrame();

  while (frame) {
    const activeHandle = await frame.evaluateHandle(() => {
      let active = document.activeElement;
      while (active?.shadowRoot?.activeElement) {
        active = active.shadowRoot.activeElement;
      }
      return active;
    });

    try {
      const active = activeHandle.asElement();
      if (!active) {
        return false;
      }
      if (await active.evaluate((node) => node.matches('input, textarea, select') || node.isContentEditable)) {
        return true;
      }
      frame = await active.contentFrame();
    } finally {
      await activeHandle.dispose();
    }
  }

  return false;
}

async function pressMacroKey(page, key, holdDurationMs = 0, { preserveEditableFocus = true } = {}) {
  // Chat owns Enter after typing. Focusing the canvas here would make roBrowser
  // open/focus chat again instead of submitting the message.
  if (preserveEditableFocus && await hasFocusedEditable(page)) {
    await page.keyboard.press(key, { delay: holdDurationMs });
    return;
  }

  const canvasTarget = await locateGameCanvas(page);

  if (canvasTarget && canvasTarget.canvasHandle) {
    await canvasTarget.canvasHandle.evaluate((node) => {
      if (!node.hasAttribute('tabindex')) {
        node.setAttribute('tabindex', '-1');
      }
      node.focus();
    });
    await canvasTarget.canvasHandle.press(key, { delay: holdDurationMs });
    return;
  }

  await page.keyboard.press(key, { delay: holdDurationMs });
}

// Each run starts with game keys. After typing, keep subsequent keys in the
// editor until an explicit focus-changing action. Resetting this per run also
// handles chat left open by a command response (for example a server cooldown).
function createWorkflowInput(page) {
  let preserveEditableFocus = false;

  return {
    pressKey(key, holdDurationMs = 0) {
      return pressMacroKey(page, key, holdDurationMs, { preserveEditableFocus });
    },
    async typeText(text, { clearFirst = false, typingDelayMs = 0 } = {}) {
      preserveEditableFocus = true;
      if (clearFirst) {
        await page.keyboard.press('Control+a');
        await page.waitForTimeout(30);
        await page.keyboard.press('Delete');
        await page.waitForTimeout(30);
      }
      if (text) {
        await page.keyboard.type(text, { delay: typingDelayMs || 0 });
      }
    },
    resetFocus() {
      preserveEditableFocus = false;
    },
  };
}

module.exports = { waitForPageReady, locateGameCanvas, pressMacroKey, createWorkflowInput };
