import QRCode from "qrcode";
import { CARDS_PER_PAGE, makeCards, modes, renderPdf } from "./cards.mjs";

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
    else if (k === "disabled") el.disabled = Boolean(v);
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
function modeInfo(mode) { return modes[mode] || modes["3x3"]; }
function numberClass(n, mode = "3x3") {
  return modeInfo(mode).labels[Math.floor((n - 1) / modeInfo(mode).span)].toLowerCase();
}
function letter(n, mode = "3x3") {
  return modeInfo(mode).labels[Math.floor((n - 1) / modeInfo(mode).span)];
}
function board(drawn, mode = "3x3", compact = false) {
  const set = new Set(drawn);
  const info = modeInfo(mode);
  const wrap = h("div", { class: `number-board mode-${mode || "3x3"} ${compact ? "compact" : ""}`, style: `--columns:${info.labels.length}` });
  for (let col = 0; col < info.labels.length; col++) {
    const column = h(
      "div",
      { class: "number-column" },
      h("div", { class: "column-head", text: info.labels[col] }),
    );
    for (let i = 1; i <= info.span; i++) {
      const n = col * info.span + i;
      column.append(
        h("div", {
          class: `number-cell ${set.has(n) ? "drawn" : ""} ${numberClass(n, mode)}`,
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
      h("small", {}, "3 × 3, 4 × 4 o 5 × 5 · cartones para imprimir"),
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
  const reveal = h("div", { class: "draw-reveal hidden", "aria-live": "polite" });
  const overlay = h("div", { class: "celebration hidden" });
  shell.append(sound, content, reveal, overlay);
  root.replaceChildren(shell);
  let revealTimer, celebrationTimer;
  function beep(kind = "draw") {
    if (!audioContext) return;
    const notes = kind === "win" ? [523, 659, 784, 1047]
      : kind === "draw" ? [392, 494, 587, 784] : [440, 660];
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
  function showDraw(number) {
    clearTimeout(revealTimer);
    clearTimeout(celebrationTimer);
    overlay.className = "celebration hidden";
    const color = numberClass(number, game.mode);
    reveal.replaceChildren(
      h("div", { class: "draw-reveal-ring" }),
      ...Array.from({ length: 12 }, (_, i) => h("i", {
        class: "draw-spark",
        style: `--angle:${i * 30}deg`,
      })),
      h("div", { class: "draw-reveal-kicker" }, "¡NUEVA BOLITA!"),
      h("div", { class: "draw-reveal-ball" },
        h("small", {}, letter(number, game.mode)), String(number)),
      h("div", { class: "draw-reveal-count" },
        `${game.drawn.length} DE ${modeInfo(game.mode).total} BOLITAS`),
    );
    reveal.className = `draw-reveal ${color}`;
    beep("draw");
    revealTimer = setTimeout(() => { reveal.className = "draw-reveal hidden"; }, 2200);
  }
  function animate(type) {
    clearTimeout(revealTimer);
    clearTimeout(celebrationTimer);
    reveal.className = "draw-reveal hidden";
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
    beep(win ? "win" : "again");
    celebrationTimer = setTimeout(() => (overlay.className = "celebration hidden"), 5500);
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
        h("div", { class: "tv-count" }, `${(game.mode || "3x3").replace("x", " × ")} · ${game.drawn.length} / ${modeInfo(game.mode).total}`),
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
            { class: `hero-ball ${latest ? numberClass(latest, game.mode) : "empty"}` },
            latest
              ? h("span", {}, h("small", {}, letter(latest, game.mode)), String(latest))
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
                .map((n) => h("b", { class: numberClass(n, game.mode), text: n })),
            ),
          ),
        ),
        h(
          "section",
          { class: "board-panel" },
          h("h2", {}, "Tablero de bolitas"),
          board(game.drawn, game.mode),
          h("p", { class: "board-note" }, [...modeInfo(game.mode).labels].map((label, i) => `${label} ${i * modeInfo(game.mode).span + 1}–${(i + 1) * modeInfo(game.mode).span}`).join(" · ")),
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
    if (drew) showDraw(game.drawn.at(-1));
    if (animationChanged) animate(game.animation.type);
    if (!drew && !animationChanged && !game.drawn.length) {
      clearTimeout(revealTimer);
      reveal.className = "draw-reveal hidden";
    }
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
  if (me.authenticated) return next(me.user);
  root.className = "app-page";
  const err = h("p", { class: "form-error" });
  const username = h("input", {
    type: "text",
    autocomplete: "username",
    placeholder: "Usuario",
    required: "",
  });
  const password = h("input", {
    type: "password",
    autocomplete: "current-password",
    placeholder: "Contraseña",
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
          const result = await post("/api/auth/login", {
            username: username.value,
            password: password.value,
          });
          await next(result.user);
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
      "Entra con tu cuenta de Bingo para dirigir la partida o generar cartones.",
    ),
    username,
    password,
    h("button", { class: "button primary", type: "submit" }, "Entrar"),
    err,
  );
  root.replaceChildren(
    banner("¡Vamos a jugar!", "El control y los cartones viven aquí."),
    form,
  );
  username.focus();
}

async function remote() {
  await login(async (user) => {
    root.className = "app-page";
    let game = null,
      source = null;
    const codeFromURL = new URLSearchParams(location.search).get("code") || "";
    const main = h("main", { class: "app-main" });
    const accountBar = h(
      "div",
      { class: "account-bar" },
      h("span", { text: `👤 ${user.username}` }),
      ...(user.role === "owner"
        ? [
            h(
              "button",
              { class: "button quiet", onclick: () => showUsers() },
              "Gestionar usuarios",
            ),
          ]
        : []),
      h(
        "button",
        {
          class: "button quiet",
          onclick: async () => {
            await post("/api/auth/logout", {});
            location.reload();
          },
        },
        "Salir",
      ),
    );
    const usersPanel = h("section", { class: "users-panel hidden" });
    root.replaceChildren(
      banner(
        "Control de bingo",
        "Tú diriges la partida; la TV muestra la magia.",
      ),
      accountBar,
      main,
      usersPanel,
    );
    async function showUsers() {
      if (!usersPanel.classList.contains("hidden")) {
        usersPanel.classList.add("hidden");
        return;
      }
      usersPanel.classList.remove("hidden");
      await refreshUsers();
    }
    async function refreshUsers() {
      try {
        const users = await api("/api/users");
        const newName = h("input", {
          placeholder: "Nuevo usuario",
          autocomplete: "off",
          required: "",
          minlength: "3",
        });
        const newPassword = h("input", {
          type: "password",
          placeholder: "Contraseña inicial (12+ caracteres)",
          autocomplete: "new-password",
          required: "",
          minlength: "12",
        });
        const note = h("p", { class: "form-error" });
        const create = h(
          "form",
          {
            class: "user-create",
            onsubmit: async (e) => {
              e.preventDefault();
              note.textContent = "";
              try {
                await post("/api/users", {
                  username: newName.value,
                  password: newPassword.value,
                });
                toast("Usuario creado.");
                await refreshUsers();
              } catch (ex) {
                errorText(note, ex);
              }
            },
          },
          newName,
          newPassword,
          h(
            "button",
            { class: "button primary", type: "submit" },
            "Crear usuario",
          ),
          note,
        );
        const rows = users.map((u) => {
          const resetInput = h("input", {
            type: "password",
            placeholder: "Nueva contraseña (12+)",
            autocomplete: "new-password",
            minlength: "12",
          });
          return h(
            "div",
            { class: "user-row" },
            h(
              "div",
              {},
              h("strong", { text: u.username }),
              h("small", {
                text: ` · ${u.role === "owner" ? "Administrador" : u.active ? "Activo" : "Desactivado"}`,
              }),
            ),
            h(
              "div",
              { class: "user-actions" },
              resetInput,
              h(
                "button",
                {
                  class: "button quiet",
                  onclick: async () => {
                    try {
                      await api(
                        `/api/users/${encodeURIComponent(u.username)}/password`,
                        {
                          method: "PUT",
                          body: JSON.stringify({ password: resetInput.value }),
                        },
                      );
                      resetInput.value = "";
                      toast("Contraseña actualizada.");
                      if (u.username === user.username) location.reload();
                    } catch (ex) {
                      toast(ex.message, true);
                    }
                  },
                },
                "Cambiar clave",
              ),
              ...(u.role === "owner"
                ? []
                : [
                    h(
                      "button",
                      {
                        class: "button quiet",
                        onclick: async () => {
                          try {
                            await api(
                              `/api/users/${encodeURIComponent(u.username)}`,
                              {
                                method: "PATCH",
                                body: JSON.stringify({ active: !u.active }),
                              },
                            );
                            await refreshUsers();
                          } catch (ex) {
                            toast(ex.message, true);
                          }
                        },
                      },
                      u.active ? "Desactivar" : "Activar",
                    ),
                  ]),
            ),
          );
        });
        usersPanel.replaceChildren(
          h("div", { class: "section-kicker" }, "CUENTAS DE BINGO"),
          h("h2", {}, "Usuarios del control"),
          h("p", {}, "Cada cuenta puede vincular y manejar sus propias TV."),
          create,
          h("div", { class: "user-list" }, ...rows),
        );
      } catch (ex) {
        usersPanel.replaceChildren(
          h("p", { class: "form-error", text: ex.message }),
        );
      }
    }
    async function act(type, value = "") {
      try {
        game = await post("/api/remote/action", { type, value });
        render();
        if (type === "reset") toast("Partida nueva. Ya puedes sacar la primera bolita.");
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
      const mode = game.mode || "3x3";
      const total = modeInfo(mode).total;
      const drawBtn = h(
        "button",
        {
          class: "draw-button",
          onclick: () => act("draw"),
          disabled: game.drawn.length === total,
        },
        h("span", {}, "✦"),
        game.drawn.length === total ? "SALIERON TODAS" : "SACAR BOLITA",
        h("small", {}, "Sorteo aleatorio · sin repetir"),
      );
      const undo = h(
        "button",
        {
          class: "button quiet",
          onclick: () => act("undo"),
          disabled: game.drawn.length === 0,
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
      const modeSelect = h("select", {
        onchange: (e) => {
          if (game.drawn.length && !confirm("Cambiar de modalidad comenzará un sorteo nuevo. ¿Continuar?")) {
            e.target.value = mode;
            return;
          }
          act("mode", e.target.value);
        },
      }, ...Object.keys(modes).map((key) => h("option", {
        value: key, ...(key === mode ? { selected: "" } : {}),
      }, key.replace("x", " × "))));
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
                  text: latest ? `${letter(latest, mode)} · ${latest}` : "—",
                }),
              ),
              h(
                "div",
                {},
                h("span", {}, "Han salido"),
                h("strong", { text: `${game.drawn.length} de ${total}` }),
              ),
            ),
            drawBtn,
            h(
              "div",
              { class: "moment-panel" },
              h("div", { class: "section-kicker" }, "MOMENTOS ESPECIALES"),
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
                  { class: "button again", onclick: () => act("animation", "try-again") },
                  "🚀 Sigue jugando",
                ),
              ),
              h("p", {}, "Tú decides cuándo alguien ganó."),
            ),
            h("div", { class: "control-row" }, undo, reset),
            h("div", { class: "theme-picker" }, h("label", {}, "Modalidad", modeSelect),
              h("p", {}, "Usa cartones de la misma modalidad en esta partida.")),
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
            board(game.drawn, mode, true),
            h(
              "div",
              { class: "drawn-list" },
              h("span", {}, "Orden de salida"),
              h("p", {
                text: game.drawn.length
                  ? game.drawn.map((n) => `${letter(n, mode)}${n}`).join(" · ")
                  : "Aún no sale ninguna bolita.",
              }),
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

function library() {
  root.className = "app-page";
  const main = h("main", { class: "app-main" });
  root.replaceChildren(
    banner("Biblioteca de cartones", "Genera, revisa e imprime un lote nuevo."),
    main,
  );
  let objectUrl = null;
  const modeInput = h("select", {}, ...Object.keys(modes).map((key) =>
    h("option", { value: key }, key.replace("x", " × "))));
  const countInput = h("input", {
    type: "number",
    min: "1",
    max: "240",
    value: "12",
  });
  const feedback = h("p", { class: "form-error" });
  const preview = h("div", { class: "cards-preview" });
  const download = h(
    "a",
    { class: "button primary disabled", href: "#", download: "" },
    "Descargar PDF carta ↓",
  );
  function clearDownload() {
    download.classList.add("disabled");
    download.href = "#";
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  function cardNode(card, mode) {
    const labels = modeInfo(mode).labels;
    return h(
      "div",
      { class: "preview-card" },
      h("div", {
        class: "preview-title",
        text: `BINGO #${String(card.id).padStart(3, "0")}`,
      }),
      h(
        "div",
        { class: "preview-grid", style: `--columns:${labels.length};--rows:${labels.length + 1}` },
        ...[...labels, ...card.grid.flat()].map((v) =>
          h("span", { text: v === null ? "★" : v, class: v === null ? "free-cell" : "", ...(v === null ? { title: "Casilla libre", "aria-label": "Casilla libre" } : {}) }),
        ),
      ),
    );
  }
  function generate() {
    clearDownload();
    preview.replaceChildren();
    const count = Number(countInput.value);
    if (!Number.isInteger(count) || count < 1 || count > 240) {
      feedback.textContent = "Elige entre 1 y 240 cartones.";
      return;
    }
    feedback.textContent = "Generando lote…";
    try {
      const mode = modeInput.value;
      const cards = makeCards(count, mode);
      const pdf = renderPdf(cards, mode);
      preview.replaceChildren(...cards.slice(0, CARDS_PER_PAGE).map((card) => cardNode(card, mode)));
      feedback.textContent = `${count} cartones únicos · ${Math.ceil(count / CARDS_PER_PAGE)} hoja${count > CARDS_PER_PAGE ? "s" : ""} carta · vista previa de los primeros ${Math.min(count, CARDS_PER_PAGE)}.`;
      objectUrl = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
      download.href = objectUrl;
      download.download = `cartones-bingo-${mode}.pdf`;
      download.classList.remove("disabled");
    } catch (ex) {
      errorText(feedback, ex);
    }
  }
  modeInput.addEventListener("change", generate);
  main.replaceChildren(
    h(
      "div",
      { class: "library-layout" },
      h(
        "section",
        { class: "library-settings" },
        h("div", { class: "section-kicker" }, "01 / PREPARAR LOTE"),
        h("h2", {}, "Cartones de bingo"),
        h(
          "p",
          {},
          "3 × 3: 30 bolitas · 4 × 4: 60 bolitas · 5 × 5 clásico: 75 bolitas y centro libre. Cada cartón es distinto dentro del lote.",
        ),
        h("label", {}, "Modalidad", modeInput),
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
  generate();
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
  library();
else home();
