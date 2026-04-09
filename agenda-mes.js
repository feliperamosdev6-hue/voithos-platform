let mesAtual = new Date().getMonth();
let anoAtual = new Date().getFullYear();
let diaSelecionado = null;
let apptEditando = null;
const appApi = window.appApi || {};
const agendaApi = appApi.agenda || {};

const normalizarStatus = (status) => {
    const key = status || "em_aberto";
    return { key, texto: key.replace("_", " ") };
};

const formatarDataBR = (iso) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
};

const abrirModalNovo = () => {
    if (!diaSelecionado) return alert("Selecione um dia primeiro.");
    document.getElementById("modal-bg").classList.remove("hidden");
};

const fecharModalNovo = () => {
    document.getElementById("modal-bg").classList.add("hidden");
};

const abrirModalEdicao = (appt) => {
    apptEditando = appt;
    document.getElementById("edit-paciente").value = appt.paciente || "";
    document.getElementById("edit-tipo").value = appt.tipo || "";
    document.getElementById("edit-hora-inicio").value = appt.horaInicio || "";
    document.getElementById("edit-hora-fim").value = appt.horaFim || "";
    document.getElementById("edit-status").value = appt.status || "em_aberto";
    document.getElementById("modal-editar").classList.remove("hidden");
};

const fecharModalEdicao = () => {
    apptEditando = null;
    document.getElementById("modal-editar").classList.add("hidden");
};

// Navegao

document.getElementById("prev-month").addEventListener("click", () => {
    mesAtual--;
    if (mesAtual < 0) {
        mesAtual = 11;
        anoAtual--;
    }
    carregarCalendario();
});

document.getElementById("next-month").addEventListener("click", () => {
    mesAtual++;
    if (mesAtual > 11) {
        mesAtual = 0;
        anoAtual++;
    }
    carregarCalendario();
});

document.getElementById("btn-voltar").addEventListener("click", () => {
    window.location.href = "agendamentos.html";
});

document.getElementById("btn-novo-agendamento").addEventListener("click", abrirModalNovo);

document.getElementById("btn-fechar-modal").addEventListener("click", fecharModalNovo);

document.getElementById("btn-salvar-agendamento").addEventListener("click", async () => {
    if (!diaSelecionado) return alert("Selecione um dia primeiro.");

    const appt = {
        data: diaSelecionado,
        paciente: document.getElementById("input-paciente").value,
        tipo: document.getElementById("input-tipo").value,
        horaInicio: document.getElementById("input-hora-inicio").value,
        horaFim: document.getElementById("input-hora-fim").value,
        status: document.getElementById("input-status").value,
    };

    await agendaApi.add(appt);

    alert("Agendamento criado!");
    fecharModalNovo();
    carregarCalendario();
});

document.getElementById("btn-cancelar-edicao").addEventListener("click", fecharModalEdicao);

document.getElementById("btn-salvar-edicao").addEventListener("click", async () => {
    if (!apptEditando) return;
    const payload = {
        ...apptEditando,
        data: diaSelecionado || apptEditando.data,
        paciente: document.getElementById("edit-paciente").value,
        tipo: document.getElementById("edit-tipo").value,
        horaInicio: document.getElementById("edit-hora-inicio").value,
        horaFim: document.getElementById("edit-hora-fim").value,
        status: document.getElementById("edit-status").value,
    };
    await agendaApi.update(apptEditando.id, payload);
    fecharModalEdicao();
    carregarCalendario();
});

const limparSelecaoDias = () => {
    document.querySelectorAll(".day-cell").forEach((cell) => cell.classList.remove("selecionado"));
};

async function carregarCalendario() {
    const grade = document.getElementById("grade-mensal");
    const listaAtendimentos = document.getElementById("lista-atendimentos");

    grade.innerHTML = "";
    listaAtendimentos.innerHTML = "<p>Selecione um dia.</p>";
    diaSelecionado = null;

    document.getElementById("mes-ano").textContent =
        new Date(anoAtual, mesAtual).toLocaleDateString("pt-BR", {
            month: "long",
            year: "numeric",
        });

    const primeiroDia = new Date(anoAtual, mesAtual, 1).getDay();
    const qtdDias = new Date(anoAtual, mesAtual + 1, 0).getDate();

    for (let i = 0; i < primeiroDia; i++) {
        const empty = document.createElement("div");
        empty.classList.add("day-cell");
        empty.style.visibility = "hidden";
        grade.appendChild(empty);
    }

    for (let dia = 1; dia <= qtdDias; dia++) {
        const dataCompleta = `${anoAtual}-${String(mesAtual + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
        const elemento = document.createElement("div");
        elemento.classList.add("day-cell", "fade-in");
        elemento.dataset.date = dataCompleta;

        const header = document.createElement("div");
        header.className = "day-header";

        const numero = document.createElement("div");
        numero.className = "day-number";
        numero.textContent = dia;

        const btnAdd = document.createElement("button");
        btnAdd.className = "btn-add";
        btnAdd.textContent = "+";
        btnAdd.addEventListener("click", (ev) => {
            ev.stopPropagation();
            diaSelecionado = dataCompleta;
            limparSelecaoDias();
            elemento.classList.add("selecionado");
            abrirModalNovo();
        });

        header.appendChild(numero);
        header.appendChild(btnAdd);

        const apptsContainer = document.createElement("div");
        apptsContainer.className = "appts";

        const atendimentos = await agendaApi.getDay(dataCompleta);

        atendimentos.forEach((a) => {
            const { key, texto } = normalizarStatus(a.status);
            const card = document.createElement("div");
            card.classList.add("card-appt", "fade-in", "scale-hover");
            card.setAttribute("draggable", true);
            card.addEventListener("dragstart", (e) => {
                e.dataTransfer.setData("appt-payload", JSON.stringify({ id: a.id, appt: a }));
            });
            card.addEventListener("click", (ev) => {
                ev.stopPropagation();
                diaSelecionado = dataCompleta;
                limparSelecaoDias();
                elemento.classList.add("selecionado");
                abrirModalEdicao(a);
            });

            card.innerHTML = `
                <div class="linha-topo">
                    <i class="fa-solid fa-user"></i>
                    <strong>${a.paciente}</strong>
                </div>
                <div>${a.tipo}  ${a.horaInicio} - ${a.horaFim}</div>
                <span class="status-badge status-${key}">${texto}</span>
            `;

            apptsContainer.appendChild(card);
        });

        elemento.appendChild(header);
        elemento.appendChild(apptsContainer);

        elemento.addEventListener("click", () => {
            diaSelecionado = dataCompleta;
            limparSelecaoDias();
            elemento.classList.add("selecionado");
            mostrarAtendimentos(atendimentos, dataCompleta);
        });

        elemento.addEventListener("dragover", (e) => e.preventDefault());
        elemento.addEventListener("drop", async (e) => {
            e.preventDefault();
            const payloadStr = e.dataTransfer.getData("appt-payload");
            if (!payloadStr) return;
            const payload = JSON.parse(payloadStr);
            const base = payload.appt;
            if (!base) return;
            await agendaApi.update(payload.id, {
                ...base,
                data: dataCompleta,
            });
            carregarCalendario();
        });

        grade.appendChild(elemento);
    }
}

function mostrarAtendimentos(atendimentos, data) {
    const painel = document.getElementById("lista-atendimentos");
    painel.innerHTML = `<h4>${formatarDataBR(data)}</h4>`;

    if (atendimentos.length === 0) {
        painel.innerHTML += "<p>Sem atendimentos neste dia.</p>";
        return;
    }

    atendimentos.forEach(a => {
        const { key, texto } = normalizarStatus(a.status);
        const card = document.createElement("div");
        card.classList.add("atendimento-card", "fade-in");

        card.innerHTML = `
            <strong>${a.paciente}</strong><br>
            ${a.tipo}<br>
            ${a.horaInicio} - ${a.horaFim}
            ${a.observacoes ? `<small>${a.observacoes}</small>` : ''}
        `;
        card.innerHTML += `<div><span class="status-badge status-${key}">${texto}</span></div>`;

        painel.appendChild(card);
    });
}

carregarCalendario();
