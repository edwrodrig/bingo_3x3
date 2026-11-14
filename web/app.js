import QRCode from "qrcode";

const root = document.getElementById("app");
const themes = {
  space: {
    name: "Espacio",
    icon: "🪐",
    kicker: "MISIÓN GALÁCTICA",
    facts: [
      "La Luna refleja la luz del Sol.",
      "El Sol es una estrella.",
      "La Tierra tarda un año en rodear el Sol.",
      "Júpiter es el planeta más grande.",
      "Saturno tiene anillos de hielo y roca.",
      "Marte se conoce como el planeta rojo.",
      "En el espacio no hay aire para escuchar sonidos.",
      "La Tierra es el tercer planeta del Sol.",
      "Una constelación es un dibujo imaginario entre estrellas.",
      "Los astronautas flotan al orbitar la Tierra.",
    ],
  },
  dino: {
    name: "Dinosaurios",
    icon: "🦖",
    kicker: "EXPEDICIÓN JURÁSICA",
    facts: [
      "Los fósiles nos ayudan a conocer animales antiguos.",
      "Algunos dinosaurios tenían plumas.",
      "El Triceratops tenía tres cuernos.",
      "El Stegosaurus tenía placas en la espalda.",
      "Había dinosaurios herbívoros y carnívoros.",
      "Las aves son descendientes de dinosaurios.",
      "Un paleontólogo estudia fósiles.",
      "Los dinosaurios vivieron mucho antes que las personas.",
      "El cuello largo ayudaba a algunos a alcanzar hojas.",
      "Una huella fósil cuenta cómo caminaba un animal.",
    ],
  },
  body: {
    name: "Cuerpo y alimentos",
    icon: "🍎",
    kicker: "LABORATORIO DE LA VIDA",
    facts: [
      "El corazón impulsa la sangre por el cuerpo.",
      "Los pulmones nos ayudan a respirar.",
      "El agua ayuda a nuestro cuerpo a funcionar.",
      "Los músculos permiten movernos.",
      "Dormir ayuda al cuerpo a descansar.",
      "Las frutas pueden aportar vitaminas.",
      "Los huesos sostienen y protegen el cuerpo.",
      "Lavarse las manos ayuda a cuidar la salud.",
      "Los dientes sirven para masticar.",
      "Comer alimentos variados ayuda a crecer.",
    ],
  },
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!response.ok) {
    let error = "Ocurrió un problema.";
    try {
      error = (await response.json()).error || error;
    } catch {}
    throw new Error(error);
  }
  return response.headers.get("Content-Type")?.includes("application/json")
    ? response.json()
    : response;
}
function post(path, body) {
  return api(path, { method: "POST", body: JSON.stringify(body) });
}
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on"))
      el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  for (const child of children.flat())
    el.append(
      child instanceof Node ? child : document.createTextNode(String(child)),
    );
  return el;
}
function banner(title, subtitle) {
  return h(
    "header",
    { class: "page-head" },
    h("a", { href: "/", class: "brand" }, "✦ BINGO FANTÁSTICO"),
    h("div", {}, h("h1", { text: title }), h("p", { text: subtitle })),
  );
}
function toast(message, bad = false) {
  const t = h("div", { class: `toast ${bad ? "bad" : ""}`, text: message });
  document.body.append(t);
  setTimeout(() => t.remove(), 4000);
}
function errorText(node, error) {
  node.textContent = error.message || String(error);
}
function numberClass(n) {
  return n <= 10 ? "b" : n <= 20 ? "i" : "n";
}
function letter(n) {
  return n <= 10 ? "B" : n <= 20 ? "I" : "N";
}
function board(drawn, compact = false) {
  const set = new Set(drawn);
  const wrap = h("div", { class: `number-board ${compact ? "compact" : ""}` });
  for (let col = 0; col < 3; col++) {
    const column = h(
      "div",
      { class: "number-column" },
      h("div", { class: "column-head", text: "BIN"[col] }),
    );
    for (let i = 1; i <= 10; i++) {
      const n = col * 10 + i;
      column.append(
        h("div", {
          class: `number-cell ${set.has(n) ? "drawn" : ""} ${numberClass(n)}`,
          text: n,
        }),
      );
    }
    wrap.append(column);
  }
  return wrap;
}

function home() {
  root.className = "home";
  root.replaceChildren(
    h("div", { class: "home-stars" }),
    h(
      "main",
      { class: "home-card" },
      h("div", { class: "eyebrow" }, "UNA AVENTURA EN CADA BOLITA"),
      h("div", { class: "home-icon" }, "🪐 ✦ 🦖"),
      h("h1", {}, "Bingo ", h("em", {}, "Fantástico")),
      h(
        "p",
        {},
        "Prepara la TV, controla el sorteo desde tu teléfono e imprime cartones para toda la familia.",
      ),
      h(
        "nav",
        { class: "home-links" },
        h("a", { href: "/tv", class: "button primary" }, "Abrir en la TV →"),
        h(
          "a",
          { href: "/remote/", class: "button secondary" },
          "Usar el control",
        ),
        h("a", { href: "/library/", class: "button quiet" }, "Crear cartones"),
      ),
      h("small", {}, "3 × 3 · 30 bolitas · 12 cartones por hoja carta"),
    ),
  );
}

async function tv() {
  root.className = "tv";
  let game = await api("/api/tv/init");
  let previousDrawn = game.drawn.length,
    previousAnimation = game.animation?.id || 0;
  let audioContext;
  const shell = h("main", { class: "tv-shell theme-" + game.theme });
  const sound = h(
    "button",
    {
      class: "sound-button",
      onclick: () => {
        audioContext ||= new (window.AudioContext ||
          window.webkitAudioContext)();
        audioContext.resume();
        sound.textContent = "🔊 Sonido activo";
      },
    },
    "🔈 Activar sonido",
  );
  const content = h("div", { class: "tv-content" });
  const overlay = h("div", { class: "celebration hidden" });
  shell.append(sound, content, overlay);
  root.replaceChildren(shell);
  function beep(win = false) {
    if (!audioContext) return;
    const notes = win ? [523, 659, 784, 1047] : [440, 660];
    notes.forEach((freq, i) => {
      const oscillator = audioContext.createOscillator(),
        gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = freq;
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      const start = audioContext.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.23);
      oscillator.start(start);
      oscillator.stop(start + 0.24);
    });
  }
  function animate(type) {
    overlay.className = `celebration ${type}`;
    const win = type === "win";
    overlay.replaceChildren(
      h("div", { class: "celebration-art", text: win ? "🏆✨🎉" : "🚀💫" }),
      h("div", {
        class: "celebration-title",
        text: win ? "¡BINGO!" : "¡SIGUE JUGANDO!",
      }),
      h("p", {
        text: win
          ? "¡Qué gran partida!"
          : "La próxima bolita puede sorprendernos.",
      }),
    );
    if (win)
      for (let i = 0; i < 45; i++)
        overlay.append(
          h("i", {
            class: "confetti",
            style: `--x:${Math.random() * 100}%;--delay:${Math.random() * 1.6}s;--hue:${Math.random() * 360}deg`,
          }),
        );
    beep(win);
    setTimeout(() => (overlay.className = "celebration hidden"), 5500);
  }
  async function render() {
    shell.className = "tv-shell theme-" + game.theme;
    const theme = themes[game.theme] || themes.space;
    if (!game.paired) {
      const link = new URL(
        "/remote/?code=" + encodeURIComponent(game.code),
        location.origin,
      ).href;
      content.replaceChildren(
        h(
          "div",
          { class: "pair-screen" },
          h("div", { class: "eyebrow", text: "LA AVENTURA COMIENZA AQUÍ" }),
          h("div", { class: "pair-emoji" }, "🪐"),
          h("h1", {}, "Conecta tu teléfono"),
          h("p", {}, "Abre el control, inicia sesión y escanea este código."),
          h("img", {
            class: "qr",
            alt: "QR para vincular el control al televisor",
            src: await QRCode.toDataURL(link, { width: 260, margin: 2 }),
          }),
          h("div", { class: "pair-code", text: game.code }),
          h("small", {}, "También puedes escribir el código en el control."),
        ),
      );
      return;
    }
    const latest = game.drawn.at(-1);
    const fact = latest
      ? theme.facts[(latest - 1) % theme.facts.length]
      : "Pulsa «Sacar bolita» en el control para comenzar.";
    content.replaceChildren(
      h(
        "div",
        { class: "tv-top" },
        h("div", { class: "tv-mark" }, "✦ BINGO FANTÁSTICO"),
        h("div", { class: "tv-theme" }, theme.icon + " " + theme.kicker),
        h("div", { class: "tv-count" }, `${game.drawn.length} / 30`),
      ),
      h(
        "div",
        { class: "tv-grid" },
        h(
          "section",
          { class: "ball-zone" },
          h("div", {
            class: "ball-label",
            text: latest ? "ÚLTIMA BOLITA" : "¡LISTOS PARA JUGAR!",
          }),
          h(
            "div",
            { class: `hero-ball ${latest ? numberClass(latest) : "empty"}` },
            latest
              ? h("span", {}, h("small", {}, letter(latest)), String(latest))
              : theme.icon,
          ),
          h("p", { class: "tv-fact", text: fact }),
          h(
            "div",
            { class: "history" },
            h("span", {}, "HAN SALIDO"),
            h(
              "div",
              {},
              ...game.drawn
                .slice(-7)
                .reverse()
                .map((n) => h("b", { class: numberClass(n), text: n })),
            ),
          ),
        ),
        h(
          "section",
          { class: "board-panel" },
          h("h2", {}, "Tablero de bolitas"),
          board(game.drawn),
          h("p", { class: "board-note" }, "B 1–10 · I 11–20 · N 21–30"),
        ),
      ),
    );
  }
  await render();
  let source = new EventSource("/api/tv/events");
  source.onmessage = async (event) => {
    const next = JSON.parse(event.data);
    const drew = next.drawn.length > previousDrawn;
    const animationChanged =
      next.animation?.id && next.animation.id !== previousAnimation;
    game = next;
    previousDrawn = game.drawn.length;
    previousAnimation = game.animation?.id || 0;
    await render();
    if (drew) beep();
    if (animationChanged) animate(game.animation.type);
  };
  source.onerror = () => {
    /* EventSource reconecta automáticamente. */
  };
  setInterval(async () => {
    if (
      !game.paired &&
      game.codeExpires &&
      Date.now() > Date.parse(game.codeExpires)
    ) {
      try {
        game = await api("/api/tv/init");
        await render();
      } catch {}
    }
  }, 15000);
}

async function login(next) {
  const me = await api("/api/auth/me");
  if (me.authenticated) return next();
  root.className = "app-page";
  const err = h("p", { class: "form-error" });
  const input = h("input", {
    type: "password",
    autocomplete: "current-password",
    placeholder: "Contraseña del control",
    required: "",
  });
  const form = h(
    "form",
    {
      class: "login-card",
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = "";
        try {
          await post("/api/auth/login", { password: input.value });
          await next();
        } catch (ex) {
          errorText(err, ex);
        }
      },
    },
    h("div", { class: "login-icon" }, "🔑"),
    h("h2", {}, "Entra al control"),
    h(
      "p",
      {},
      "Solo la persona que dirige la partida puede sacar bolitas y crear cartones.",
    ),
    input,
    h("button", { class: "button primary", type: "submit" }, "Entrar"),
    err,
  );
  root.replaceChildren(
    banner("¡Vamos a jugar!", "El control y los cartones viven aquí."),
    form,
  );
  input.focus();
}

async function remote() {
  await login(async () => {
    root.className = "app-page";
    let game = null,
      source = null;
    const codeFromURL = new URLSearchParams(location.search).get("code") || "";
    const main = h("main", { class: "app-main" });
    root.replaceChildren(
      banner(
        "Control de bingo",
        "Tú diriges la partida; la TV muestra la magia.",
      ),
      main,
    );
    async function act(type, value = "") {
      try {
        game = await post("/api/remote/action", { type, value });
        render();
      } catch (ex) {
        toast(ex.message, true);
      }
    }
    function connect() {
      source?.close();
      source = new EventSource("/api/remote/events");
      source.onmessage = (e) => {
        game = JSON.parse(e.data);
        render();
      };
    }
    function pairForm(message = "") {
      const input = h("input", {
        placeholder: "Código de la TV",
        value: codeFromURL,
        maxlength: "6",
        autocapitalize: "characters",
        required: "",
      });
      const note = h("p", { class: "form-error", text: message });
      const existing = h("div", { class: "existing-tvs" });
      main.replaceChildren(
        h(
          "section",
          { class: "pair-card" },
          h("div", { class: "section-kicker" }, "01 / VINCULAR"),
          h("h2", {}, "Conecta la TV"),
          h(
            "p",
            {},
            "Abre bingo.labo86.cl/tv en la pantalla y escribe su código. También puedes escanear el QR.",
          ),
          h(
            "form",
            {
              class: "pair-form",
              onsubmit: async (e) => {
                e.preventDefault();
                try {
                  await post("/api/pair", { code: input.value });
                  history.replaceState(null, "", "/remote/");
                  game = await api("/api/remote/state");
                  connect();
                  render();
                } catch (ex) {
                  errorText(note, ex);
                }
              },
            },
            input,
            h(
              "button",
              { class: "button primary", type: "submit" },
              "Vincular →",
            ),
          ),
          note,
          existing,
        ),
      );
      api("/api/remote/tvs")
        .then((tvs) => {
          if (!tvs.length) return;
          existing.replaceChildren(
            h("h3", {}, "TV ya vinculada"),
            ...tvs.map((tv, i) =>
              h(
                "button",
                {
                  class: "button quiet",
                  onclick: async () => {
                    try {
                      await post("/api/remote/select", { id: tv.id });
                      game = await api("/api/remote/state");
                      connect();
                      render();
                    } catch (ex) {
                      errorText(note, ex);
                    }
                  },
                },
                `Usar TV ${i + 1} · ${tv.drawn} bolitas`,
              ),
            ),
          );
        })
        .catch(() => {});
    }
    function render() {
      if (!game) {
        pairForm();
        return;
      }
      const latest = game.drawn.at(-1),
        theme = themes[game.theme] || themes.space;
      const drawBtn = h(
        "button",
        {
          class: "draw-button",
          onclick: () => act("draw"),
          disabled: game.drawn.length === 30 ? "" : "",
        },
        h("span", {}, "✦"),
        game.drawn.length === 30 ? "SALIERON TODAS" : "SACAR BOLITA",
        h("small", {}, "Sorteo aleatorio · sin repetir"),
      );
      const undo = h(
        "button",
        {
          class: "button quiet",
          onclick: () => act("undo"),
          disabled: game.drawn.length === 0 ? "" : "",
        },
        "↶ Deshacer última",
      );
      const reset = h(
        "button",
        {
          class: "button quiet danger",
          onclick: () => {
            if (
              confirm(
                "¿Comenzar una partida nueva? Se borrará el sorteo actual.",
              )
            )
              act("reset");
          },
        },
        "Nueva partida",
      );
      const themeSelect = h(
        "select",
        { onchange: (e) => act("theme", e.target.value) },
        ...Object.entries(themes).map(([key, t]) =>
          h(
            "option",
            { value: key, ...(key === game.theme ? { selected: "" } : {}) },
            t.icon + " " + t.name,
          ),
        ),
      );
      main.replaceChildren(
        h(
          "div",
          { class: "remote-layout" },
          h(
            "section",
            { class: "control-main" },
            h("div", { class: "section-kicker" }, "01 / SORTEO EN VIVO"),
            h(
              "div",
              { class: "remote-status" },
              h(
                "div",
                {},
                h("span", {}, "Última bolita"),
                h("strong", {
                  text: latest ? `${letter(latest)} · ${latest}` : "—",
                }),
              ),
              h(
                "div",
                {},
                h("span", {}, "Han salido"),
                h("strong", { text: `${game.drawn.length} de 30` }),
              ),
            ),
            drawBtn,
            h("div", { class: "control-row" }, undo, reset),
            h(
              "div",
              { class: "theme-picker" },
              h("label", {}, "Tema de la TV", themeSelect),
              h(
                "p",
                {},
                "Cada bolita trae un dato curioso para aprender jugando.",
              ),
            ),
          ),
          h(
            "section",
            { class: "control-side" },
            h("div", { class: "section-kicker" }, "02 / TABLERO"),
            board(game.drawn, true),
            h(
              "div",
              { class: "drawn-list" },
              h("span", {}, "Orden de salida"),
              h("p", {
                text: game.drawn.length
                  ? game.drawn.map((n) => `${letter(n)}${n}`).join(" · ")
                  : "Aún no sale ninguna bolita.",
              }),
            ),
          ),
        ),
        h(
          "section",
          { class: "moment-panel" },
          h(
            "div",
            {},
            h("div", { class: "section-kicker" }, "03 / MOMENTOS ESPECIALES"),
            h("h2", {}, "Haz que la TV celebre"),
            h(
              "p",
              {},
              "Tú decides cuándo alguien ganó. La aplicación no revisa cartones.",
            ),
          ),
          h(
            "div",
            { class: "moment-actions" },
            h(
              "button",
              { class: "button win", onclick: () => act("animation", "win") },
              "🏆 ¡Bingo!",
            ),
            h(
              "button",
              {
                class: "button again",
                onclick: () => act("animation", "try-again"),
              },
              "🚀 Sigue jugando",
            ),
          ),
        ),
        h(
          "nav",
          { class: "bottom-nav" },
          h("a", { href: "/library/" }, "🖨️ Crear cartones"),
          h("a", { href: "/tv" }, "📺 Abrir TV"),
        ),
      );
    }
    try {
      game = await api("/api/remote/state");
      connect();
      render();
    } catch {
      pairForm();
    }
  });
}

async function library() {
  await login(async () => {
    root.className = "app-page";
    const main = h("main", { class: "app-main" });
    root.replaceChildren(
      banner(
        "Biblioteca de cartones",
        "Genera, revisa e imprime un lote nuevo.",
      ),
      main,
    );
    let seed = Math.floor(Math.random() * 2 ** 32),
      count = 12,
      cards = [];
    const countInput = h("input", {
      type: "number",
      min: "1",
      max: "240",
      value: "12",
    });
    const feedback = h("p", { class: "form-error" });
    const preview = h("div", { class: "cards-preview" });
    const seedText = h("code", { text: String(seed) });
    const download = h(
      "a",
      { class: "button primary disabled", href: "#", download: "" },
      "Descargar PDF carta ↓",
    );
    function cardNode(card) {
      return h(
        "div",
        { class: "preview-card" },
        h("div", {
          class: "preview-title",
          text: `BINGO #${String(card.id).padStart(3, "0")}`,
        }),
        h(
          "div",
          { class: "preview-grid" },
          ...["B", "I", "N", ...card.grid.flat()].map((v) =>
            h("span", { text: v }),
          ),
        ),
      );
    }
    async function generate() {
      count = Number(countInput.value);
      if (!Number.isInteger(count) || count < 1 || count > 240) {
        feedback.textContent = "Elige entre 1 y 240 cartones.";
        return;
      }
      seed = Math.floor(Math.random() * 2 ** 32);
      seedText.textContent = String(seed);
      feedback.textContent = "Generando lote…";
      download.classList.add("disabled");
      try {
        const data = await api(
          `/api/cards/preview?count=${count}&seed=${seed}`,
        );
        cards = data.cards;
        preview.replaceChildren(...cards.slice(0, 12).map(cardNode));
        feedback.textContent = `${count} cartones únicos · ${Math.ceil(count / 12)} hoja${count > 12 ? "s" : ""} carta · vista previa de los primeros ${Math.min(count, 12)}.`;
        download.href = `/api/cards/pdf?count=${count}&seed=${seed}`;
        download.classList.remove("disabled");
      } catch (ex) {
        errorText(feedback, ex);
      }
    }
    main.replaceChildren(
      h(
        "div",
        { class: "library-layout" },
        h(
          "section",
          { class: "library-settings" },
          h("div", { class: "section-kicker" }, "01 / PREPARAR LOTE"),
          h("h2", {}, "Cartones 3 × 3"),
          h(
            "p",
            {},
            "Números del 1 al 30 en columnas B, I y N. Cada cartón es distinto dentro del lote.",
          ),
          h("label", {}, "Cantidad de cartones", countInput),
          h(
            "button",
            { class: "button secondary", onclick: generate },
            "✦ Generar otro lote",
          ),
          h(
            "div",
            { class: "print-info" },
            h("b", {}, "Impresión económica"),
            h(
              "p",
              {},
              "12 por hoja carta · 3 columnas × 4 filas · solo líneas y números negros · márgenes de corte.",
            ),
          ),
          h("div", { class: "batch-seed" }, "Semilla del lote: ", seedText),
          download,
          feedback,
        ),
        h(
          "section",
          { class: "library-preview" },
          h("div", { class: "section-kicker" }, "02 / VISTA PREVIA"),
          h("h2", {}, "Así se verán"),
          preview,
        ),
      ),
      h(
        "nav",
        { class: "bottom-nav" },
        h("a", { href: "/remote/" }, "🎮 Ir al control"),
        h("a", { href: "/tv" }, "📺 Abrir TV"),
      ),
    );
    await generate();
  });
}

const path = location.pathname.replace(/\/$/, "");
if (path === "/tv")
  tv().catch((e) => {
    root.textContent = e.message;
  });
else if (path === "/remote")
  remote().catch((e) => {
    root.textContent = e.message;
  });
else if (path === "/library")
  library().catch((e) => {
    root.textContent = e.message;
  });
else home();
