window.__ModuleLoader__.load({
	id: "dsh-tender-web",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let react_dom = require("react-dom");
		react_dom = __toESM(react_dom, 1);
		//#region src/client/product-capabilities.js
		function createProductCapabilities(React) {
			let value = {
				workbench: false,
				knowledge: false,
				taskGuide: false
			};
			const listeners = /* @__PURE__ */ new Set();
			return {
				install() {
					let disposed = false;
					let pending = false;
					const refresh = async () => {
						if (pending) return;
						pending = true;
						try {
							const response = await fetch("/api/agent-pi/capabilities");
							if (!response.ok) return;
							const next = await response.json();
							if (!disposed && (next.workbench !== value.workbench || next.knowledge !== value.knowledge || next.taskGuide !== value.taskGuide)) {
								value = {
									workbench: next.workbench === true,
									knowledge: next.knowledge === true,
									taskGuide: next.taskGuide === true
								};
								for (const notify of listeners) notify(value);
							}
						} finally {
							pending = false;
						}
					};
					const update = () => {
						refresh().catch(() => {});
					};
					update();
					const timer = setInterval(update, 5e3);
					window.addEventListener("focus", update);
					return () => {
						disposed = true;
						clearInterval(timer);
						window.removeEventListener("focus", update);
					};
				},
				use() {
					const [state, setState] = React.useState(value);
					React.useEffect(() => {
						listeners.add(setState);
						setState(value);
						return () => listeners.delete(setState);
					}, []);
					return state;
				}
			};
		}
		//#endregion
		//#region src/client/workflow-editor.js
		function patchWorkflowStage(draft, index, patch) {
			const oldId = draft.stages[index].id;
			const stages = draft.stages.map((stage, i) => {
				const next = i === index ? {
					...stage,
					...patch
				} : { ...stage };
				if (patch.id !== void 0 && Array.isArray(next.consumes)) next.consumes = next.consumes.map((item) => item.kind === "handoff" && item.stageId === oldId ? {
					...item,
					stageId: patch.id
				} : item);
				return next;
			});
			return {
				...draft,
				stages,
				setupStageId: patch.id !== void 0 && draft.setupStageId === oldId ? patch.id : draft.setupStageId
			};
		}
		function workflowDependencyError(stages) {
			const seen = /* @__PURE__ */ new Set();
			for (const stage of stages) {
				for (const item of stage.consumes || []) if (item.kind === "handoff" && !seen.has(item.stageId)) return {
					stage: stage.labelZh || stage.id,
					dependency: item.stageId
				};
				seen.add(stage.id);
			}
			return null;
		}
		function moveWorkflowStage(draft, index, delta) {
			const dest = index + delta;
			if (dest < 0 || dest >= draft.stages.length) return draft;
			const stages = draft.stages.slice();
			const [stage] = stages.splice(index, 1);
			stages.splice(dest, 0, stage);
			return {
				...draft,
				stages
			};
		}
		function stageDependents(draft, id) {
			return draft.stages.filter((stage) => (stage.consumes || []).some((item) => item.kind === "handoff" && item.stageId === id));
		}
		function removeWorkflowStage(draft, index) {
			if (draft.stages.length <= 1 || stageDependents(draft, draft.stages[index].id).length) return draft;
			const stages = draft.stages.filter((_, i) => i !== index);
			return {
				...draft,
				stages,
				setupStageId: draft.setupStageId === draft.stages[index].id ? stages[0].id : draft.setupStageId
			};
		}
		function nextStageId(stages) {
			const ids = new Set(stages.map((stage) => stage.id));
			for (let n = 1;; n++) if (!ids.has("stage-" + n)) return "stage-" + n;
		}
		//#endregion
		//#region src/client/locales/workflow-editor.js
		const WORKFLOW_EDITOR_I18N = {
			zh: {
				"wb.pluginDisabled": "此功能的插件已停用。可以在插件管理中重新启用。",
				"mm.exportDefinition": "导出流程",
				"mm.controlProfile": "流程约束",
				"mm.freeWorkflow": "自定义流程",
				"mm.tenderControls": "保留内置投标校验",
				"mm.freeWorkflowConfirm": "转为自定义流程后，将解除内置投标专属校验和能力依赖，现有人工确认节点仍保留。是否继续？",
				"mm.newWorkflow": "自己新建工作台",
				"mm.dependencies": "依赖的前置阶段",
				"mm.noSetupStage": "无手动资料登记阶段",
				"mm.dependencyError": "“{stage}”依赖“{dependency}”，请先调整依赖再移动阶段。",
				"mm.removeDependency": "以下阶段仍依赖本阶段：{stages}。请先取消或修改依赖。",
				"mm.lead": "直接新建、复制和编辑自己的工作台，设置阶段、技能、知识库和交付要求。也可以选用对话辅助设计。",
				"mm.editLead": "调整阶段、依赖、技能和知识库。保存用于新项目，已有项目保留创建时的流程。",
				"mm.saveConfirm": "保存此工作台定义？新项目采用新流程，已有项目保留原流程。",
				"mm.deleteConfirm": "删除自定义工作台“{name}”？已有项目的数据和流程快照保留。",
				"mm.labelZh": "显示名称（可使用你的语言）",
				"mm.stageZh": "阶段名称",
				"mm.createTitle": "对话辅助设计（可选）",
				"mm.design": "让对话辅助设计",
				"mm.pickKind": "也可以描述需求，请智能体拟定方案；检查并确认后再保存。"
			},
			en: {
				"wb.pluginDisabled": "The plugin for this feature is disabled. You can enable it in plugin management.",
				"mm.exportDefinition": "Export workflow",
				"mm.controlProfile": "Workflow constraints",
				"mm.freeWorkflow": "Custom workflow",
				"mm.tenderControls": "Keep built-in tender validation",
				"mm.freeWorkflowConfirm": "Switching to a custom workflow removes built-in tender checks and capability dependencies. Existing human approval stages remain. Continue?",
				"mm.newWorkflow": "Create your own workbench",
				"mm.dependencies": "Prerequisite stages",
				"mm.noSetupStage": "No manual intake stage",
				"mm.dependencyError": "“{stage}” depends on “{dependency}”. Update its dependencies before moving it.",
				"mm.removeDependency": "These stages still depend on this stage: {stages}. Update their dependencies first.",
				"mm.lead": "Create, copy and edit your workbenches, including stages, skills, knowledge sources and deliverable requirements. Conversation-assisted design is optional.",
				"mm.editLead": "Edit stages, dependencies, skills and knowledge sources. Changes apply to new projects; existing projects retain their original workflow.",
				"mm.saveConfirm": "Save this workbench definition? New projects use it; existing projects retain their original workflow.",
				"mm.deleteConfirm": "Delete custom workbench “{name}”? Existing project data and workflow snapshots are retained.",
				"mm.labelZh": "Display name (in your language)",
				"mm.stageZh": "Stage name",
				"mm.createTitle": "Conversation-assisted design (optional)",
				"mm.design": "Design with the assistant",
				"mm.pickKind": "Describe your needs to draft a proposal, then review and confirm before saving."
			},
			es: {
				"mm.newWorkflow": "Crear un entorno de trabajo propio",
				"mm.dependencies": "Etapas previas requeridas",
				"mm.noSetupStage": "Sin etapa de registro manual",
				"mm.dependencyError": "«{stage}» depende de «{dependency}». Modifique las dependencias antes de moverla.",
				"mm.removeDependency": "Estas etapas aún dependen de esta etapa: {stages}. Modifique primero las dependencias."
			},
			fr: {
				"mm.newWorkflow": "Créer mon atelier",
				"mm.dependencies": "Étapes préalables requises",
				"mm.noSetupStage": "Aucune étape de saisie manuelle",
				"mm.dependencyError": "« {stage} » dépend de « {dependency} ». Modifiez les dépendances avant de la déplacer.",
				"mm.removeDependency": "Ces étapes dépendent encore de cette étape : {stages}. Modifiez d’abord leurs dépendances."
			},
			de: {
				"mm.newWorkflow": "Eigene Arbeitsoberfläche erstellen",
				"mm.dependencies": "Erforderliche vorherige Phasen",
				"mm.noSetupStage": "Keine manuelle Erfassungsphase",
				"mm.dependencyError": "„{stage}“ hängt von „{dependency}“ ab. Passen Sie vor dem Verschieben die Abhängigkeiten an.",
				"mm.removeDependency": "Diese Phasen hängen noch von dieser Phase ab: {stages}. Passen Sie zuerst die Abhängigkeiten an."
			},
			ja: {
				"mm.newWorkflow": "独自のワークベンチを作成",
				"mm.dependencies": "前提となる工程",
				"mm.noSetupStage": "手動の資料登録工程なし",
				"mm.dependencyError": "「{stage}」は「{dependency}」に依存しています。移動する前に依存関係を変更してください。",
				"mm.removeDependency": "次の工程がこの工程に依存しています：{stages}。先に依存関係を変更してください。"
			},
			ko: {
				"mm.newWorkflow": "내 작업대 만들기",
				"mm.dependencies": "필수 선행 단계",
				"mm.noSetupStage": "수동 자료 등록 단계 없음",
				"mm.dependencyError": "“{stage}” 단계는 “{dependency}”에 종속됩니다. 이동 전에 종속 관계를 수정하세요.",
				"mm.removeDependency": "다음 단계가 이 단계에 종속됩니다: {stages}. 먼저 종속 관계를 수정하세요."
			},
			pt: {
				"mm.newWorkflow": "Criar minha bancada de trabalho",
				"mm.dependencies": "Etapas prévias obrigatórias",
				"mm.noSetupStage": "Sem etapa de cadastro manual",
				"mm.dependencyError": "“{stage}” depende de “{dependency}”. Altere as dependências antes de mover a etapa.",
				"mm.removeDependency": "Estas etapas ainda dependem desta etapa: {stages}. Altere primeiro as dependências."
			},
			ru: {
				"mm.newWorkflow": "Создать собственную рабочую панель",
				"mm.dependencies": "Необходимые предшествующие этапы",
				"mm.noSetupStage": "Без ручного ввода материалов",
				"mm.dependencyError": "Этап «{stage}» зависит от «{dependency}». Измените зависимости перед перемещением.",
				"mm.removeDependency": "Эти этапы зависят от данного этапа: {stages}. Сначала измените их зависимости."
			},
			ar: {
				"mm.newWorkflow": "إنشاء لوحة عمل خاصة",
				"mm.dependencies": "المراحل السابقة المطلوبة",
				"mm.noSetupStage": "بدون مرحلة تسجيل يدوي للمواد",
				"mm.dependencyError": "تعتمد «{stage}» على «{dependency}». عدّل التبعيات قبل نقل المرحلة.",
				"mm.removeDependency": "لا تزال هذه المراحل تعتمد على هذه المرحلة: {stages}. عدّل تبعياتها أولاً."
			}
		};
		//#endregion
		//#region src/client/locales/workbench-fields.js
		const WORKBENCH_FIELDS = {
			es: {
				"mm.lead": "Cree, copie y edite sus entornos de trabajo: etapas, habilidades, fuentes y entregables. La asistencia por conversación es opcional.",
				"mm.lead2": "Los módulos integrados y los flujos de proyectos existentes se conservan.",
				"mm.design": "Diseñar con el asistente",
				"mm.createTitle": "Diseño asistido por conversación (opcional)",
				"mm.editTitle": "Editar módulo · {name}",
				"mm.moduleId": "Identificador del módulo (letras latinas minúsculas; no use tender, delivery ni investment)",
				"mm.kbPack": "Fuentes de conocimiento seleccionadas",
				"mm.kbPackLead": "Seleccione las fuentes que este flujo puede utilizar. La selección sustituye las referencias predeterminadas de cada área.",
				"mm.kbOwnOnly": "Usar únicamente las fuentes seleccionadas, sin ejemplos predeterminados",
				"mm.kbEmpty": "Importe primero los documentos en la base de conocimiento y después selecciónelos aquí.",
				"mm.area.analysis": "Análisis y documentación",
				"mm.area.pricing": "Cálculo de precios",
				"mm.area.planning": "Planificación y redacción",
				"mm.listsSources": "Agrupar tareas por volumen o nombre de documento (PDF y DOCX homónimos cuentan como uno)",
				"mm.builtinLocked": "Cree una copia para editar un módulo integrado. Los proyectos existentes conservan su flujo original.",
				"mm.copyThenEdit": "Copiar y editar",
				"mm.title": "Gestión de módulos",
				"mm.labelZh": "Nombre visible (en su idioma)",
				"mm.labelEn": "Nombre en inglés (opcional)",
				"mm.setupStage": "Etapa de registro de documentación",
				"mm.controlProfile": "Restricciones del flujo de trabajo",
				"mm.freeWorkflow": "Flujo de trabajo personalizado",
				"mm.tenderControls": "Conservar las validaciones de licitación",
				"mm.exportDefinition": "Exportar flujo de trabajo",
				"mm.cancel": "Cancelar",
				"mm.stageN": "Etapa {n}",
				"mm.moveUp": "Subir",
				"mm.moveDown": "Bajar",
				"mm.deleteStage": "Eliminar etapa",
				"mm.stageId": "Identificador de etapa (letras latinas minúsculas)",
				"mm.stageZh": "Nombre de la etapa",
				"mm.stageHint": "Descripción breve",
				"mm.stagePrompt": "Requisitos de la etapa",
				"mm.skillSlugs": "Identificadores de habilidades (separados por comas)",
				"mm.reviewSlugs": "Habilidades de revisión (opcional)",
				"mm.reviewPolicy": "Alcance de la revisión",
				"mm.reviewRisk": "Revisión por riesgo, cambios y muestreo",
				"mm.reviewAll": "Revisar todos los archivos",
				"mm.approvalGate": "Exigir aprobación humana antes de continuar",
				"mm.approvalPrompt": "Decisión que debe confirmar el usuario",
				"mm.approveLabel": "Texto del botón de aprobación",
				"mm.rejectLabel": "Texto del botón de pausa o rechazo (opcional)",
				"mm.binding": "Fuentes de conocimiento",
				"mm.bindNone": "Ninguna",
				"mm.bindAnalysis": "Análisis",
				"mm.bindPricing": "Cálculo de precios",
				"mm.bindPlanning": "Planificación",
				"mm.summaryFile": "Nombre del informe de síntesis (opcional)",
				"mm.summaryOutline": "Esquema del informe (un elemento por línea)",
				"mm.addStage": "Añadir etapa",
				"mm.saving": "Guardando…",
				"mm.saveLive": "Guardar definición",
				"mm.list": "Módulos ({n})",
				"mm.builtin": "Integrado",
				"mm.custom": "Personalizado",
				"mm.stageCount": "{n} etapas",
				"mm.editStages": "Editar etapas",
				"mm.copyAsCustom": "Crear copia personalizada",
				"mm.delete": "Eliminar",
				"mm.enable": "Activar",
				"mm.disable": "Desactivar",
				"mm.enabled": "Se ha activado {name}",
				"mm.disabled": "Se ha desactivado {name}",
				"mm.saved": "Módulo {id} guardado",
				"mm.saveConfirm": "¿Guardar la definición? Los nuevos proyectos la utilizarán; los existentes conservarán su flujo de trabajo original.",
				"mm.deleteConfirm": "¿Eliminar el entorno personalizado «{name}»? Se conservarán los datos y las instantáneas de flujo de los proyectos existentes.",
				"mm.editLead": "Edite etapas, dependencias, habilidades y fuentes de conocimiento. Los cambios se aplican a nuevos proyectos; los existentes conservan su flujo original.",
				"mm.freeWorkflowConfirm": "Se eliminarán las validaciones específicas de licitación y sus dependencias de capacidades. Se conservarán las etapas de aprobación humana. ¿Continuar?",
				"wb.pluginDisabled": "El complemento de esta función está desactivado. Puede activarlo en la gestión de complementos."
			},
			fr: {
				"mm.lead": "Créez, copiez et modifiez vos ateliers : étapes, compétences, sources et livrables. La conception par dialogue est facultative.",
				"mm.lead2": "Les modules intégrés et les processus des projets existants sont conservés.",
				"mm.design": "Concevoir avec l’assistant",
				"mm.createTitle": "Conception par dialogue (facultative)",
				"mm.editTitle": "Modifier le module · {name}",
				"mm.moduleId": "Identifiant du module (lettres latines minuscules ; tender, delivery et investment sont réservés)",
				"mm.kbPack": "Sources de connaissances sélectionnées",
				"mm.kbPackLead": "Sélectionnez les sources utilisables par ce processus. Elles remplacent les références prédéfinies de chaque domaine.",
				"mm.kbOwnOnly": "Utiliser uniquement les sources sélectionnées, sans exemples prédéfinis",
				"mm.kbEmpty": "Importez d’abord les documents dans la base de connaissances, puis sélectionnez-les ici.",
				"mm.area.analysis": "Analyse et documentation",
				"mm.area.pricing": "Chiffrage",
				"mm.area.planning": "Planification et rédaction",
				"mm.listsSources": "Regrouper les tâches par volume ou nom de document (PDF et DOCX de même nom comptent pour un)",
				"mm.builtinLocked": "Créez une copie pour modifier un module intégré. Les projets existants conservent leur processus initial.",
				"mm.copyThenEdit": "Copier et modifier",
				"mm.title": "Gestion des modules",
				"mm.labelZh": "Nom affiché (dans votre langue)",
				"mm.labelEn": "Nom en anglais (facultatif)",
				"mm.setupStage": "Étape de dépôt des documents",
				"mm.controlProfile": "Contraintes du processus",
				"mm.freeWorkflow": "Processus personnalisé",
				"mm.tenderControls": "Conserver les contrôles des appels d’offres",
				"mm.exportDefinition": "Exporter le processus",
				"mm.cancel": "Annuler",
				"mm.stageN": "Étape {n}",
				"mm.moveUp": "Monter",
				"mm.moveDown": "Descendre",
				"mm.deleteStage": "Supprimer l’étape",
				"mm.stageId": "Identifiant de l’étape (lettres latines minuscules)",
				"mm.stageZh": "Nom de l’étape",
				"mm.stageHint": "Description courte",
				"mm.stagePrompt": "Exigences de l’étape",
				"mm.skillSlugs": "Identifiants des compétences (séparés par des virgules)",
				"mm.reviewSlugs": "Compétences de révision (facultatif)",
				"mm.reviewPolicy": "Périmètre de la révision",
				"mm.reviewRisk": "Révision selon les risques, les modifications et l’échantillonnage",
				"mm.reviewAll": "Réviser tous les fichiers",
				"mm.approvalGate": "Exiger une validation humaine avant de poursuivre",
				"mm.approvalPrompt": "Décision à confirmer par l’utilisateur",
				"mm.approveLabel": "Libellé du bouton de validation",
				"mm.rejectLabel": "Libellé du bouton de pause ou de rejet (facultatif)",
				"mm.binding": "Sources de connaissances",
				"mm.bindNone": "Aucune",
				"mm.bindAnalysis": "Analyse",
				"mm.bindPricing": "Établissement des prix",
				"mm.bindPlanning": "Planification",
				"mm.summaryFile": "Nom du fichier de synthèse (facultatif)",
				"mm.summaryOutline": "Plan de synthèse (un élément par ligne)",
				"mm.addStage": "Ajouter une étape",
				"mm.saving": "Enregistrement…",
				"mm.saveLive": "Enregistrer la définition",
				"mm.list": "Modules ({n})",
				"mm.builtin": "Intégré",
				"mm.custom": "Personnalisé",
				"mm.stageCount": "{n} étapes",
				"mm.editStages": "Modifier les étapes",
				"mm.copyAsCustom": "Créer une copie personnalisée",
				"mm.delete": "Supprimer",
				"mm.enable": "Activer",
				"mm.disable": "Désactiver",
				"mm.enabled": "{name} activé",
				"mm.disabled": "{name} désactivé",
				"mm.saved": "Module {id} enregistré",
				"mm.saveConfirm": "Enregistrer la définition ? Les nouveaux projets l’utiliseront ; les projets existants conserveront leur processus initial.",
				"mm.deleteConfirm": "Supprimer l’atelier personnalisé « {name} » ? Les données et les instantanés de processus des projets existants seront conservés.",
				"mm.editLead": "Modifiez les étapes, dépendances, compétences et sources de connaissances. Les modifications concernent les nouveaux projets ; les projets existants conservent leur processus initial.",
				"mm.freeWorkflowConfirm": "Les contrôles propres aux appels d’offres et leurs dépendances de capacités seront retirés. Les étapes de validation humaine seront conservées. Continuer ?",
				"wb.pluginDisabled": "Le plugin de cette fonctionnalité est désactivé. Vous pouvez l’activer dans la gestion des plugins."
			},
			de: {
				"mm.lead": "Erstellen, kopieren und bearbeiten Sie eigene Arbeitsoberflächen mit Phasen, Fähigkeiten, Quellen und Ergebnissen. Dialoggestützte Gestaltung ist optional.",
				"mm.lead2": "Integrierte Module und Abläufe bestehender Projekte bleiben erhalten.",
				"mm.design": "Mit dem Assistenten gestalten",
				"mm.createTitle": "Dialoggestützte Gestaltung (optional)",
				"mm.editTitle": "Modul bearbeiten · {name}",
				"mm.moduleId": "Modulkennung (lateinische Kleinbuchstaben; tender, delivery und investment sind reserviert)",
				"mm.kbPack": "Ausgewählte Wissensquellen",
				"mm.kbPackLead": "Wählen Sie die Quellen für diesen Ablauf. Sie ersetzen die vordefinierten Referenzen im jeweiligen Bereich.",
				"mm.kbOwnOnly": "Nur ausgewählte Quellen verwenden, ohne vordefinierte Beispiele",
				"mm.kbEmpty": "Importieren Sie zunächst Dokumente in die Wissensbasis und wählen Sie sie anschließend hier aus.",
				"mm.area.analysis": "Analyse und Unterlagen",
				"mm.area.pricing": "Preiskalkulation",
				"mm.area.planning": "Planung und Ausarbeitung",
				"mm.listsSources": "Aufgaben nach Band oder Dokumentname bündeln (gleichnamige PDF- und DOCX-Dateien zählen als ein Dokument)",
				"mm.builtinLocked": "Erstellen Sie zum Bearbeiten eine Kopie des integrierten Moduls. Bestehende Projekte behalten ihren ursprünglichen Ablauf.",
				"mm.copyThenEdit": "Kopieren und bearbeiten",
				"mm.title": "Modulverwaltung",
				"mm.labelZh": "Anzeigename (in Ihrer Sprache)",
				"mm.labelEn": "Englischer Name (optional)",
				"mm.setupStage": "Phase zur Erfassung der Unterlagen",
				"mm.controlProfile": "Vorgaben für den Arbeitsablauf",
				"mm.freeWorkflow": "Benutzerdefinierter Arbeitsablauf",
				"mm.tenderControls": "Integrierte Angebotsprüfungen beibehalten",
				"mm.exportDefinition": "Arbeitsablauf exportieren",
				"mm.cancel": "Abbrechen",
				"mm.stageN": "Phase {n}",
				"mm.moveUp": "Nach oben",
				"mm.moveDown": "Nach unten",
				"mm.deleteStage": "Phase löschen",
				"mm.stageId": "Phasenkennung (lateinische Kleinbuchstaben)",
				"mm.stageZh": "Phasenname",
				"mm.stageHint": "Kurzbeschreibung",
				"mm.stagePrompt": "Anforderungen dieser Phase",
				"mm.skillSlugs": "Skill-Kennungen (durch Kommas getrennt)",
				"mm.reviewSlugs": "Skills für die Prüfung (optional)",
				"mm.reviewPolicy": "Prüfumfang",
				"mm.reviewRisk": "Risiko-, änderungs- und stichprobenbasierte Prüfung",
				"mm.reviewAll": "Alle Dateien prüfen",
				"mm.approvalGate": "Vor dem Fortfahren eine menschliche Freigabe verlangen",
				"mm.approvalPrompt": "Vom Benutzer zu bestätigende Entscheidung",
				"mm.approveLabel": "Beschriftung der Freigabeschaltfläche",
				"mm.rejectLabel": "Beschriftung für Pause oder Ablehnung (optional)",
				"mm.binding": "Wissensquellen",
				"mm.bindNone": "Keine",
				"mm.bindAnalysis": "Analyse",
				"mm.bindPricing": "Preiskalkulation",
				"mm.bindPlanning": "Planung",
				"mm.summaryFile": "Dateiname des zusammenfassenden Berichts (optional)",
				"mm.summaryOutline": "Berichtsgliederung (ein Punkt pro Zeile)",
				"mm.addStage": "Phase hinzufügen",
				"mm.saving": "Wird gespeichert…",
				"mm.saveLive": "Definition speichern",
				"mm.list": "Module ({n})",
				"mm.builtin": "Integriert",
				"mm.custom": "Benutzerdefiniert",
				"mm.stageCount": "{n} Phasen",
				"mm.editStages": "Phasen bearbeiten",
				"mm.copyAsCustom": "Eigene Kopie erstellen",
				"mm.delete": "Löschen",
				"mm.enable": "Aktivieren",
				"mm.disable": "Deaktivieren",
				"mm.enabled": "{name} aktiviert",
				"mm.disabled": "{name} deaktiviert",
				"mm.saved": "Modul {id} gespeichert",
				"mm.saveConfirm": "Definition speichern? Neue Projekte verwenden sie; bestehende Projekte behalten ihren ursprünglichen Arbeitsablauf.",
				"mm.deleteConfirm": "Benutzerdefinierte Arbeitsoberfläche „{name}“ löschen? Daten und gespeicherte Arbeitsabläufe bestehender Projekte bleiben erhalten.",
				"mm.editLead": "Bearbeiten Sie Phasen, Abhängigkeiten, Skills und Wissensquellen. Änderungen gelten für neue Projekte; bestehende Projekte behalten ihren ursprünglichen Ablauf.",
				"mm.freeWorkflowConfirm": "Die integrierten Angebotsprüfungen und ihre Fähigkeitsabhängigkeiten werden entfernt. Menschliche Freigaben bleiben erhalten. Fortfahren?",
				"wb.pluginDisabled": "Das Plugin für diese Funktion ist deaktiviert. Sie können es in der Pluginverwaltung aktivieren."
			},
			ja: {
				"mm.lead": "工程、スキル、参照資料、成果物の要件を設定して、独自のワークベンチを作成・複製・編集できます。対話による設計支援は任意です。",
				"mm.lead2": "組み込みモジュールと既存プロジェクトのワークフローは保持されます。",
				"mm.design": "アシスタントと設計",
				"mm.createTitle": "対話による設計支援（任意）",
				"mm.editTitle": "モジュールを編集 · {name}",
				"mm.moduleId": "モジュール ID（半角英小文字。tender、delivery、investment は予約済み）",
				"mm.kbPack": "選択した参照資料",
				"mm.kbPackLead": "このワークフローで使用する資料を選択します。各分野の既定の参照資料はこの選択に置き換わります。",
				"mm.kbOwnOnly": "選択した資料だけを使用し、既定の例文は使用しない",
				"mm.kbEmpty": "先にナレッジベースに資料を取り込み、ここで選択してください。",
				"mm.area.analysis": "分析・資料整理",
				"mm.area.pricing": "価格積算",
				"mm.area.planning": "計画・文書作成",
				"mm.listsSources": "分冊または文書名ごとにタスクをまとめる（同名の PDF と DOCX は 1 件）",
				"mm.builtinLocked": "組み込みモジュールは複製してから編集してください。既存プロジェクトは元のワークフローを保持します。",
				"mm.copyThenEdit": "複製して編集",
				"mm.title": "モジュール管理",
				"mm.labelZh": "表示名（任意の言語）",
				"mm.labelEn": "英語名（任意）",
				"mm.setupStage": "資料登録の工程",
				"mm.controlProfile": "ワークフローの制約",
				"mm.freeWorkflow": "カスタムワークフロー",
				"mm.tenderControls": "組み込みの入札検証を維持",
				"mm.exportDefinition": "ワークフローをエクスポート",
				"mm.cancel": "キャンセル",
				"mm.stageN": "工程 {n}",
				"mm.moveUp": "上へ",
				"mm.moveDown": "下へ",
				"mm.deleteStage": "工程を削除",
				"mm.stageId": "工程ID（半角英小文字）",
				"mm.stageZh": "工程名",
				"mm.stageHint": "簡単な説明",
				"mm.stagePrompt": "工程の要件",
				"mm.skillSlugs": "スキルID（カンマ区切り）",
				"mm.reviewSlugs": "レビュースキルID（任意）",
				"mm.reviewPolicy": "レビュー範囲",
				"mm.reviewRisk": "リスク・変更点・サンプリングに基づくレビュー",
				"mm.reviewAll": "すべてのファイルをレビュー",
				"mm.approvalGate": "次の工程に進む前にユーザーの承認を必須にする",
				"mm.approvalPrompt": "ユーザーに確認する事項",
				"mm.approveLabel": "承認ボタンの表示名",
				"mm.rejectLabel": "一時停止・差し戻しボタンの表示名（任意）",
				"mm.binding": "参照するナレッジ",
				"mm.bindNone": "なし",
				"mm.bindAnalysis": "分析",
				"mm.bindPricing": "価格算定",
				"mm.bindPlanning": "計画",
				"mm.summaryFile": "総括報告書のファイル名（任意）",
				"mm.summaryOutline": "報告書の構成（1行1項目）",
				"mm.addStage": "工程を追加",
				"mm.saving": "保存中…",
				"mm.saveLive": "定義を保存",
				"mm.list": "モジュール（{n}）",
				"mm.builtin": "組み込み",
				"mm.custom": "カスタム",
				"mm.stageCount": "{n}工程",
				"mm.editStages": "工程を編集",
				"mm.copyAsCustom": "カスタムとして複製",
				"mm.delete": "削除",
				"mm.enable": "有効化",
				"mm.disable": "無効化",
				"mm.enabled": "{name}を有効にしました",
				"mm.disabled": "{name}を無効にしました",
				"mm.saved": "モジュール{id}を保存しました",
				"mm.saveConfirm": "定義を保存しますか？新規プロジェクトに適用され、既存プロジェクトは元のワークフローを維持します。",
				"mm.deleteConfirm": "カスタムワークベンチ「{name}」を削除しますか？既存プロジェクトのデータとワークフローのスナップショットは保持されます。",
				"mm.editLead": "工程、依存関係、スキル、ナレッジを編集できます。変更は新規プロジェクトに適用され、既存プロジェクトは元のワークフローを維持します。",
				"mm.freeWorkflowConfirm": "入札専用の検証と機能の依存関係を解除します。既存のユーザー承認工程は維持されます。続行しますか？",
				"wb.pluginDisabled": "この機能のプラグインは無効です。プラグイン管理で有効にできます。"
			},
			ko: {
				"mm.lead": "단계, 스킬, 자료와 산출물 요건을 설정하여 작업대를 만들고 복사하고 편집하세요. 대화형 설계 지원은 선택 사항입니다.",
				"mm.lead2": "기본 제공 모듈과 기존 프로젝트의 작업 흐름은 유지됩니다.",
				"mm.design": "어시스턴트와 설계",
				"mm.createTitle": "대화형 설계 지원 (선택 사항)",
				"mm.editTitle": "모듈 편집 · {name}",
				"mm.moduleId": "모듈 ID (영문 소문자, tender·delivery·investment는 예약됨)",
				"mm.kbPack": "선택한 지식 자료",
				"mm.kbPackLead": "이 작업 흐름에서 사용할 자료를 선택하세요. 각 영역의 기본 참조 자료가 이 선택으로 대체됩니다.",
				"mm.kbOwnOnly": "선택한 자료만 사용하고 기본 예시는 제외",
				"mm.kbEmpty": "먼저 지식 베이스에 자료를 가져온 뒤 여기에서 선택하세요.",
				"mm.area.analysis": "분석 및 자료 정리",
				"mm.area.pricing": "가격 산정",
				"mm.area.planning": "계획 및 문서 작성",
				"mm.listsSources": "권별 또는 문서명별로 작업 묶기 (같은 이름의 PDF와 DOCX는 하나로 처리)",
				"mm.builtinLocked": "기본 제공 모듈은 복사한 뒤 편집하세요. 기존 프로젝트는 원래 작업 흐름을 유지합니다.",
				"mm.copyThenEdit": "복사 후 편집",
				"mm.title": "모듈 관리",
				"mm.labelZh": "표시 이름 (원하는 언어)",
				"mm.labelEn": "영문 이름 (선택 사항)",
				"mm.setupStage": "자료 등록 단계",
				"mm.controlProfile": "워크플로 제약 조건",
				"mm.freeWorkflow": "사용자 지정 워크플로",
				"mm.tenderControls": "기본 입찰 검증 유지",
				"mm.exportDefinition": "워크플로 내보내기",
				"mm.cancel": "취소",
				"mm.stageN": "{n}단계",
				"mm.moveUp": "위로",
				"mm.moveDown": "아래로",
				"mm.deleteStage": "단계 삭제",
				"mm.stageId": "단계 ID (영문 소문자)",
				"mm.stageZh": "단계 이름",
				"mm.stageHint": "간단한 설명",
				"mm.stagePrompt": "단계 요구 사항",
				"mm.skillSlugs": "스킬 ID (쉼표로 구분)",
				"mm.reviewSlugs": "검토 스킬 ID (선택 사항)",
				"mm.reviewPolicy": "검토 범위",
				"mm.reviewRisk": "위험·변경·표본 기반 검토",
				"mm.reviewAll": "모든 파일 검토",
				"mm.approvalGate": "다음 단계 전에 사용자 승인 필요",
				"mm.approvalPrompt": "사용자 확인 사항",
				"mm.approveLabel": "승인 버튼 이름",
				"mm.rejectLabel": "일시 정지 또는 반려 버튼 이름 (선택 사항)",
				"mm.binding": "참조 지식 자료",
				"mm.bindNone": "없음",
				"mm.bindAnalysis": "분석",
				"mm.bindPricing": "가격 산정",
				"mm.bindPlanning": "계획",
				"mm.summaryFile": "종합 보고서 파일 이름 (선택 사항)",
				"mm.summaryOutline": "보고서 목차 (한 줄에 한 항목)",
				"mm.addStage": "단계 추가",
				"mm.saving": "저장 중…",
				"mm.saveLive": "정의 저장",
				"mm.list": "모듈 ({n})",
				"mm.builtin": "기본 제공",
				"mm.custom": "사용자 지정",
				"mm.stageCount": "{n}개 단계",
				"mm.editStages": "단계 편집",
				"mm.copyAsCustom": "사용자 지정 사본 만들기",
				"mm.delete": "삭제",
				"mm.enable": "활성화",
				"mm.disable": "비활성화",
				"mm.enabled": "{name} 활성화됨",
				"mm.disabled": "{name} 비활성화됨",
				"mm.saved": "모듈 {id} 저장됨",
				"mm.saveConfirm": "정의를 저장할까요? 새 프로젝트에 적용되며 기존 프로젝트는 원래 워크플로를 유지합니다.",
				"mm.deleteConfirm": "사용자 지정 작업대 “{name}”을 삭제할까요? 기존 프로젝트 데이터와 워크플로 스냅샷은 보존됩니다.",
				"mm.editLead": "단계, 종속 관계, 스킬, 지식 자료를 편집하세요. 변경 사항은 새 프로젝트에 적용되며 기존 프로젝트는 원래 워크플로를 유지합니다.",
				"mm.freeWorkflowConfirm": "입찰 전용 검증과 기능 종속 관계가 해제됩니다. 기존 사용자 승인 단계는 유지됩니다. 계속할까요?",
				"wb.pluginDisabled": "이 기능의 플러그인이 비활성화되었습니다. 플러그인 관리에서 활성화할 수 있습니다."
			},
			pt: {
				"mm.lead": "Crie, copie e edite suas bancadas: etapas, habilidades, fontes e entregáveis. O apoio por conversa é opcional.",
				"mm.lead2": "Os módulos integrados e os fluxos dos projetos existentes são preservados.",
				"mm.design": "Projetar com o assistente",
				"mm.createTitle": "Projeto assistido por conversa (opcional)",
				"mm.editTitle": "Editar módulo · {name}",
				"mm.moduleId": "Identificador do módulo (letras latinas minúsculas; tender, delivery e investment são reservados)",
				"mm.kbPack": "Fontes de conhecimento selecionadas",
				"mm.kbPackLead": "Selecione as fontes que este fluxo pode usar. A seleção substitui as referências predefinidas de cada área.",
				"mm.kbOwnOnly": "Usar apenas as fontes selecionadas, sem exemplos predefinidos",
				"mm.kbEmpty": "Importe primeiro os documentos na base de conhecimento e depois selecione-os aqui.",
				"mm.area.analysis": "Análise e documentação",
				"mm.area.pricing": "Composição de preços",
				"mm.area.planning": "Planejamento e redação",
				"mm.listsSources": "Agrupar tarefas por volume ou nome do documento (PDF e DOCX com o mesmo nome contam como um)",
				"mm.builtinLocked": "Crie uma cópia para editar um módulo integrado. Os projetos existentes mantêm o fluxo original.",
				"mm.copyThenEdit": "Copiar e editar",
				"mm.title": "Gerenciamento de módulos",
				"mm.labelZh": "Nome de exibição (no seu idioma)",
				"mm.labelEn": "Nome em inglês (opcional)",
				"mm.setupStage": "Etapa de cadastro de documentos",
				"mm.controlProfile": "Restrições do fluxo de trabalho",
				"mm.freeWorkflow": "Fluxo de trabalho personalizado",
				"mm.tenderControls": "Manter validações de licitação integradas",
				"mm.exportDefinition": "Exportar fluxo de trabalho",
				"mm.cancel": "Cancelar",
				"mm.stageN": "Etapa {n}",
				"mm.moveUp": "Mover para cima",
				"mm.moveDown": "Mover para baixo",
				"mm.deleteStage": "Excluir etapa",
				"mm.stageId": "Identificador da etapa (letras latinas minúsculas)",
				"mm.stageZh": "Nome da etapa",
				"mm.stageHint": "Descrição breve",
				"mm.stagePrompt": "Requisitos da etapa",
				"mm.skillSlugs": "Identificadores de habilidades (separados por vírgulas)",
				"mm.reviewSlugs": "Habilidades de revisão (opcional)",
				"mm.reviewPolicy": "Escopo da revisão",
				"mm.reviewRisk": "Revisão por risco, alterações e amostragem",
				"mm.reviewAll": "Revisar todos os arquivos",
				"mm.approvalGate": "Exigir aprovação humana antes de continuar",
				"mm.approvalPrompt": "Decisão a ser confirmada pelo usuário",
				"mm.approveLabel": "Texto do botão de aprovação",
				"mm.rejectLabel": "Texto do botão de pausa ou rejeição (opcional)",
				"mm.binding": "Fontes de conhecimento",
				"mm.bindNone": "Nenhuma",
				"mm.bindAnalysis": "Análise",
				"mm.bindPricing": "Composição de preços",
				"mm.bindPlanning": "Planejamento",
				"mm.summaryFile": "Nome do arquivo do relatório de síntese (opcional)",
				"mm.summaryOutline": "Estrutura do relatório (um item por linha)",
				"mm.addStage": "Adicionar etapa",
				"mm.saving": "Salvando…",
				"mm.saveLive": "Salvar definição",
				"mm.list": "Módulos ({n})",
				"mm.builtin": "Integrado",
				"mm.custom": "Personalizado",
				"mm.stageCount": "{n} etapas",
				"mm.editStages": "Editar etapas",
				"mm.copyAsCustom": "Criar cópia personalizada",
				"mm.delete": "Excluir",
				"mm.enable": "Ativar",
				"mm.disable": "Desativar",
				"mm.enabled": "{name} ativado",
				"mm.disabled": "{name} desativado",
				"mm.saved": "Módulo {id} salvo",
				"mm.saveConfirm": "Salvar a definição? Novos projetos a utilizarão; os existentes manterão o fluxo de trabalho original.",
				"mm.deleteConfirm": "Excluir a bancada personalizada “{name}”? Os dados e as versões do fluxo de trabalho dos projetos existentes serão preservados.",
				"mm.editLead": "Edite etapas, dependências, habilidades e fontes de conhecimento. As alterações se aplicam a novos projetos; os existentes mantêm o fluxo original.",
				"mm.freeWorkflowConfirm": "As validações específicas de licitação e suas dependências de capacidades serão removidas. As etapas de aprovação humana serão mantidas. Continuar?",
				"wb.pluginDisabled": "O plugin desta função está desativado. Você pode ativá-lo no gerenciamento de plugins."
			},
			ru: {
				"mm.lead": "Создавайте, копируйте и редактируйте рабочие панели: этапы, навыки, источники и требования к результатам. Помощь в диалоге необязательна.",
				"mm.lead2": "Встроенные модули и процессы существующих проектов сохраняются.",
				"mm.design": "Разработать с помощником",
				"mm.createTitle": "Разработка в диалоге (необязательно)",
				"mm.editTitle": "Редактировать модуль · {name}",
				"mm.moduleId": "Идентификатор модуля (строчная латиница; tender, delivery и investment зарезервированы)",
				"mm.kbPack": "Выбранные источники знаний",
				"mm.kbPackLead": "Выберите источники для этого процесса. Они заменят предустановленные материалы в соответствующих разделах.",
				"mm.kbOwnOnly": "Использовать только выбранные источники, без предустановленных примеров",
				"mm.kbEmpty": "Сначала импортируйте документы в базу знаний, затем выберите их здесь.",
				"mm.area.analysis": "Анализ и материалы",
				"mm.area.pricing": "Расчёт стоимости",
				"mm.area.planning": "Планирование и подготовка документов",
				"mm.listsSources": "Объединять задачи по тому или имени документа (одноимённые PDF и DOCX считаются одним документом)",
				"mm.builtinLocked": "Для редактирования встроенного модуля создайте копию. Существующие проекты сохранят исходный процесс.",
				"mm.copyThenEdit": "Скопировать и редактировать",
				"mm.title": "Управление модулями",
				"mm.labelZh": "Отображаемое имя (на вашем языке)",
				"mm.labelEn": "Название на английском (необязательно)",
				"mm.setupStage": "Этап регистрации документов",
				"mm.controlProfile": "Ограничения рабочего процесса",
				"mm.freeWorkflow": "Настраиваемый рабочий процесс",
				"mm.tenderControls": "Сохранить встроенные проверки тендера",
				"mm.exportDefinition": "Экспортировать рабочий процесс",
				"mm.cancel": "Отмена",
				"mm.stageN": "Этап {n}",
				"mm.moveUp": "Вверх",
				"mm.moveDown": "Вниз",
				"mm.deleteStage": "Удалить этап",
				"mm.stageId": "Идентификатор этапа (строчные латинские буквы)",
				"mm.stageZh": "Название этапа",
				"mm.stageHint": "Краткое описание",
				"mm.stagePrompt": "Требования этапа",
				"mm.skillSlugs": "Идентификаторы навыков (через запятую)",
				"mm.reviewSlugs": "Навыки проверки (необязательно)",
				"mm.reviewPolicy": "Объём проверки",
				"mm.reviewRisk": "Проверка по рискам, изменениям и выборке",
				"mm.reviewAll": "Проверять все файлы",
				"mm.approvalGate": "Требовать подтверждение пользователя перед продолжением",
				"mm.approvalPrompt": "Решение, которое должен подтвердить пользователь",
				"mm.approveLabel": "Надпись на кнопке подтверждения",
				"mm.rejectLabel": "Надпись на кнопке паузы или отклонения (необязательно)",
				"mm.binding": "Источники знаний",
				"mm.bindNone": "Нет",
				"mm.bindAnalysis": "Анализ",
				"mm.bindPricing": "Расчёт цен",
				"mm.bindPlanning": "Планирование",
				"mm.summaryFile": "Имя файла сводного отчёта (необязательно)",
				"mm.summaryOutline": "План отчёта (один пункт в строке)",
				"mm.addStage": "Добавить этап",
				"mm.saving": "Сохранение…",
				"mm.saveLive": "Сохранить определение",
				"mm.list": "Модули ({n})",
				"mm.builtin": "Встроенный",
				"mm.custom": "Пользовательский",
				"mm.stageCount": "Этапов: {n}",
				"mm.editStages": "Изменить этапы",
				"mm.copyAsCustom": "Создать пользовательскую копию",
				"mm.delete": "Удалить",
				"mm.enable": "Включить",
				"mm.disable": "Отключить",
				"mm.enabled": "{name}: включено",
				"mm.disabled": "{name}: отключено",
				"mm.saved": "Модуль {id} сохранён",
				"mm.saveConfirm": "Сохранить определение? Новые проекты будут использовать его; существующие сохранят исходный рабочий процесс.",
				"mm.deleteConfirm": "Удалить пользовательскую рабочую панель «{name}»? Данные и снимки рабочих процессов существующих проектов сохранятся.",
				"mm.editLead": "Редактируйте этапы, зависимости, навыки и источники знаний. Изменения применяются к новым проектам; существующие сохраняют исходный процесс.",
				"mm.freeWorkflowConfirm": "Специальные проверки тендера и зависимости от встроенных возможностей будут сняты. Этапы подтверждения пользователем сохранятся. Продолжить?",
				"wb.pluginDisabled": "Плагин этой функции отключён. Его можно включить в управлении плагинами."
			},
			ar: {
				"mm.lead": "أنشئ لوحات عملك وانسخها وعدّل مراحلها ومهاراتها ومصادرها ومتطلبات مخرجاتها. المساعدة عبر المحادثة اختيارية.",
				"mm.lead2": "تُحفظ الوحدات المدمجة ومسارات عمل المشاريع القائمة دون تغيير.",
				"mm.design": "التصميم بمساعدة المساعد",
				"mm.createTitle": "التصميم عبر المحادثة (اختياري)",
				"mm.editTitle": "تعديل الوحدة · {name}",
				"mm.moduleId": "معرّف الوحدة (أحرف لاتينية صغيرة؛ tender وdelivery وinvestment محجوزة)",
				"mm.kbPack": "مصادر المعرفة المختارة",
				"mm.kbPackLead": "اختر المصادر التي يمكن لمسار العمل استخدامها. تحل هذه الاختيارات محل المراجع الافتراضية لكل مجال.",
				"mm.kbOwnOnly": "استخدام المصادر المحددة فقط، دون الأمثلة الافتراضية",
				"mm.kbEmpty": "استورد المستندات في قاعدة المعرفة أولاً، ثم اخترها هنا.",
				"mm.area.analysis": "التحليل والمستندات",
				"mm.area.pricing": "حساب الأسعار",
				"mm.area.planning": "التخطيط وإعداد المستندات",
				"mm.listsSources": "تجميع المهام حسب المجلد أو اسم المستند (ملفا PDF وDOCX بالاسم نفسه يُحسبان مستنداً واحداً)",
				"mm.builtinLocked": "أنشئ نسخة لتعديل وحدة مدمجة. تحتفظ المشاريع القائمة بمسار عملها الأصلي.",
				"mm.copyThenEdit": "نسخ ثم تعديل",
				"mm.title": "إدارة الوحدات",
				"mm.labelZh": "الاسم المعروض (بلغتك)",
				"mm.labelEn": "الاسم بالإنجليزية (اختياري)",
				"mm.setupStage": "مرحلة تسجيل المستندات",
				"mm.controlProfile": "قيود سير العمل",
				"mm.freeWorkflow": "سير عمل مخصص",
				"mm.tenderControls": "الإبقاء على فحوصات المناقصة المدمجة",
				"mm.exportDefinition": "تصدير سير العمل",
				"mm.cancel": "إلغاء",
				"mm.stageN": "المرحلة {n}",
				"mm.moveUp": "نقل لأعلى",
				"mm.moveDown": "نقل لأسفل",
				"mm.deleteStage": "حذف المرحلة",
				"mm.stageId": "معرّف المرحلة (أحرف لاتينية صغيرة)",
				"mm.stageZh": "اسم المرحلة",
				"mm.stageHint": "وصف موجز",
				"mm.stagePrompt": "متطلبات المرحلة",
				"mm.skillSlugs": "معرّفات المهارات (مفصولة بفواصل)",
				"mm.reviewSlugs": "مهارات المراجعة (اختياري)",
				"mm.reviewPolicy": "نطاق المراجعة",
				"mm.reviewRisk": "المراجعة حسب المخاطر والتغييرات والعينات",
				"mm.reviewAll": "مراجعة جميع الملفات",
				"mm.approvalGate": "اشتراط موافقة المستخدم قبل المتابعة",
				"mm.approvalPrompt": "القرار المطلوب من المستخدم تأكيده",
				"mm.approveLabel": "نص زر الموافقة",
				"mm.rejectLabel": "نص زر الإيقاف المؤقت أو الرفض (اختياري)",
				"mm.binding": "مصادر المعرفة",
				"mm.bindNone": "بدون",
				"mm.bindAnalysis": "التحليل",
				"mm.bindPricing": "تحليل الأسعار",
				"mm.bindPlanning": "التخطيط",
				"mm.summaryFile": "اسم ملف التقرير التجميعي (اختياري)",
				"mm.summaryOutline": "مخطط التقرير (عنصر واحد في كل سطر)",
				"mm.addStage": "إضافة مرحلة",
				"mm.saving": "جارٍ الحفظ…",
				"mm.saveLive": "حفظ التعريف",
				"mm.list": "الوحدات ({n})",
				"mm.builtin": "مدمج",
				"mm.custom": "مخصص",
				"mm.stageCount": "عدد المراحل: {n}",
				"mm.editStages": "تعديل المراحل",
				"mm.copyAsCustom": "إنشاء نسخة مخصصة",
				"mm.delete": "حذف",
				"mm.enable": "تفعيل",
				"mm.disable": "تعطيل",
				"mm.enabled": "تم تفعيل {name}",
				"mm.disabled": "تم تعطيل {name}",
				"mm.saved": "تم حفظ الوحدة {id}",
				"mm.saveConfirm": "هل تريد حفظ التعريف؟ ستستخدمه المشاريع الجديدة، وستحتفظ المشاريع الحالية بسير عملها الأصلي.",
				"mm.deleteConfirm": "هل تريد حذف لوحة العمل المخصصة «{name}»؟ ستُحفظ بيانات المشاريع الحالية ولقطات سير عملها.",
				"mm.editLead": "عدّل المراحل والتبعيات والمهارات ومصادر المعرفة. تسري التغييرات على المشاريع الجديدة، بينما تحتفظ المشاريع الحالية بسير عملها الأصلي.",
				"mm.freeWorkflowConfirm": "ستُزال فحوصات المناقصة الخاصة وتبعيات القدرات المدمجة. ستبقى مراحل موافقة المستخدم. هل تريد المتابعة؟",
				"wb.pluginDisabled": "تم تعطيل الملحق الخاص بهذه الميزة. يمكنك تفعيله من إدارة الملحقات."
			}
		};
		//#endregion
		//#region src/client/locales/catalog.js
		const AP_I18N = {
			zh: {
				"workbench.title": "专业化工作台",
				"files.openExplorer": "在资源管理器中打开",
				"files.opening": "正在打开资源管理器…",
				"files.openFailed": "无法打开文件夹",
				"files.noCwd": "还没有工作区路径",
				"files.uploadFiles": "上传文件到对话",
				"files.uploadFolder": "上传文件夹",
				"files.title": "资源文件",
				"files.official": "工作成果",
				"files.officialName": "Official Outputs",
				"files.officialEmpty": "还没有正式产出。会话里改过的报告、地图等会自动落到这里。",
				"files.officialHint": "这里展示会话与工作台的正式产出，不依赖模型自己选目录。",
				"files.workspace": "工作区",
				"files.uploads": "上传资料",
				"files.pickWorkspace": "先选择工作区",
				"files.collapse": "收起资源文件",
				"files.expand": "展开资源文件",
				"files.refresh": "刷新",
				"files.addFolder": "加入文件夹地址（不上传文件）",
				"files.resize": "拖动调整宽度",
				"nav.kb": "知识库",
				"nav.kbTitle": "本地知识库：规范、合同、范文与用户模板，按文档结构精确索引",
				"wb.back": "返回对话",
				"wb.noCwd": "未选择工作区 · 聊天仍是默认路径，工作台只加速阶段准备",
				"wb.kb": "知识库",
				"wb.kbTitle": "跨项目共享的规范、合同、范文与用户模板；勾选用户模板后本轮复刻其格式与深度",
				"wb.modules": "模块管理",
				"wb.modulesTitle": "直接新建、编辑和管理自己的工作台，也可选用对话辅助设计",
				"wb.refresh": "刷新",
				"wb.adopt": "升级当前工作",
				"wb.adoptTitle": "把当前会话工作区登记为所选模块的专业项目，不另建目录",
				"wb.create": "新建项目",
				"wb.upgrade": "将当前工作升级",
				"wb.landing": "这就是这个流程的步骤。先开一个项目，或把当前工作升级上来，监控条才会出现并跟着走。",
				"wb.projects": "项目",
				"wb.pickProject": "选择一个项目",
				"wb.moduleErrors": "有 {n} 个模块定义文件加载失败（见模块管理）。",
				"module.tender": "投标全流程",
				"module.delivery": "实施控制",
				"module.investment": "投资尽调",
				"create.close": "关闭",
				"create.titleAdopt": "将当前工作升级为专业项目",
				"create.titleNew": "新建{name}项目",
				"create.hintAdopt": "沿用当前会话工作区和已有正式成果，只补一张专业盘面。可选投标、实施、尽调或任意自建模块。",
				"create.hintNew": "使用现有对话执行内核，建立独立项目目录、明确资料边界并按专业流程推进。登记资料时可附企业工效表，有则优先于网络调研。",
				"create.whichModule": "升级到哪个专业模块？不会改写已有正式成果。",
				"create.step.module": "选择模块",
				"create.step.info": "项目信息",
				"create.step.folder": "项目文件夹",
				"create.step.files": "依据资料",
				"create.step.confirmAdopt": "确认升级",
				"create.step.confirmNew": "流程确认",
				"session.archive": "归档对话",
				"session.archiveTitle": "归档当前对话。完整记录在左侧「归档」里查看，归档后也可删除。",
				"session.archiveFailed": "归档失败",
				"session.delete": "删除对话",
				"session.deleteConfirm": "从侧栏和归档中移除？完整记录不再列出（本机日志仍保留）。",
				"session.deleteFailed": "删除失败",
				"archive.title": "归档",
				"archive.lead": "完成的工作区先归档，不占进行中列表。点开仍是完整对话记录；归档的工作区和对话都可以删除。",
				"archive.empty": "还没有归档。侧栏工作区菜单选「归档工作区」，或对单条会话选「归档会话」。",
				"archive.open": "打开完整记录",
				"archive.delete": "删除",
				"archive.ungrouped": "未分组",
				"archive.workspace": "归档工作区",
				"archive.workspaceConfirm": "归档后，这个工作区和里面的对话会从进行中列表移到「归档」。完整记录仍可打开，归档后也可以删除。",
				"archive.workspaceFailed": "工作区归档失败",
				"archive.workspaceLive": "工作区仍在进行中",
				"archive.workspaceEmpty": "这个工作区没有对话。",
				"archive.deleteWorkspace": "删除工作区",
				"archive.deleteWorkspaceConfirm": "删除这个工作区登记？目录和已归档对话还在。",
				"kb.title": "本地知识库",
				"kb.refresh": "刷新",
				"kb.reindexAll": "全部重建",
				"kb.reindexing": "重建中…",
				"kb.reindexTitle": "按原路径（若仍存在）重新切块并更新索引",
				"kb.import": "导入",
				"kb.tokenOk": "Token 有效",
				"kb.tokenBad": "Token 无效",
				"kb.mineruSaved": "MinerU 已保存",
				"kb.mineruMissing": "MinerU 未配置",
				"kb.mineruNeedRestart": "MinerU 需重启宿主",
				"kb.path1Title": "路径一 · 本页导入",
				"kb.path1Body": "用「选择文件」或多选拖入。文件先落入下方原始文档区，不会自动解析。有文本层的 PDF 本机抽文本（快）；扫描件和复杂版式再点「解析入库」走 MinerU。MinerU 的 HTML 表会收成 Markdown 表；已入库的点「全部重建」即可。索引按文档自己的章/节/条/Clause 切。",
				"kb.path2Title": "路径二 · 对话导入知识库",
				"kb.path2Warn": "只把 PDF 丢进主对话、不说话，不会进知识库。贴上文件后发送下面这句：",
				"kb.path2After": "也能说：知识库、入库、知识包、准确整理、完整内容、全文转录。模型写好「…-知识包」文件夹后，右侧对该文件夹或 pack.json 右键「一键导入知识包」，立刻可检索。普通文件仍可右键「一键导入知识库」，和本页是同一套解析。",
				"kb.tplTitle": "用户模板 · 复刻版式",
				"kb.tplBody": "把你已经编好的较好文档入库为「用户模板」，再勾选「本次任务选用」。本轮业务稿复刻它的格式、大纲、章节顺序和内容深度；项目事实仍走规范、合同和本项目资料，不从模板抄数字、地名或合同号。文件名以「模板」结尾时，右侧一键入库会自动归入此类。",
				"kb.packTitle": "传递包 · 仅本应用",
				"kb.packBody": "每条知识库文件、用户模板、本机技能后面都可以「导出」成 .apkb。这是本应用密封的传递包，用 zip / Office / 记事本打不开。对方在本页点「导入传递包」，条目会回到原来的分类和子目录（例如规范 → COTO 2020）。",
				"kb.pickTitle": "选择文件后立刻出现在下方，不会自动解析",
				"kb.picking": "正在落入存储区…",
				"kb.pickFiles": "选择文件",
				"kb.importPackTitle": "导入 Agent Pi 传递包（.apkb），其他工具无法解析",
				"kb.importing": "导入中…",
				"kb.importPack": "导入传递包",
				"kb.parseTitle": "对已落入原始文档区的文件做解析并写入知识库",
				"kb.parsing": "解析中…",
				"kb.parseIn": "解析入库",
				"kb.category": "分类",
				"kb.customCategory": "自定义分类…",
				"kb.customCategoryPh": "自定义分类名",
				"kb.customNamePh": "自定义名称（可选，默认用文件名）",
				"kb.thisPick": "本次选择：{name}",
				"kb.multiHint": "支持多选。选完先落入原始文档区，不会自动解析。",
				"kb.parseFailed": "解析失败",
				"kb.stagedWait": "已落入原始文档区，等待解析入库",
				"kb.progress": "进度 {n}%",
				"kb.parsingChip": "解析中",
				"kb.failedChip": "失败",
				"kb.pendingChip": "待解析",
				"kb.retry": "重试",
				"kb.remove": "移除",
				"kb.landing": "已选中，正在落入原始文档区…",
				"kb.landingProgress": "正在落入原始文档区…",
				"kb.mineruSummary": "MinerU Token（大文件 / 精度抽取）",
				"kb.mineruCurrent": "当前：{hint}。不回显全文。",
				"kb.mineruSavedHint": "已保存",
				"kb.mineruUnconfigured": "未配置。小于 10MB 可走免登录轻量接口；更大文件需要 Token。申请：https://mineru.net/apiManage/token",
				"kb.mineruOldHost": "当前窗口还是旧宿主，粘贴后点保存也不会落盘。请关掉 Agent Pi DSH 再打开，然后重新粘贴并点保存。",
				"kb.mineruTokenPh": "粘贴 MinerU Token 后点保存",
				"kb.saving": "保存中…",
				"kb.saveToken": "保存 Token",
				"kb.probeTitle": "向 MinerU 探测鉴权，不提交解析任务",
				"kb.probing": "验证中…",
				"kb.probe": "验证是否有效",
				"kb.clear": "清除",
				"kb.mineruOcr": "有文本层的 PDF 会关闭 OCR；扫描件才开 OCR。超过官方页数或体积上限时自动拆段、串行解析、合并成一条。",
				"kb.pastePath": "或粘贴已有文件路径",
				"kb.pastePathPh": "原文件路径、知识包文件夹，或 MinerU 产物文件夹",
				"kb.staging": "落入中…",
				"kb.stage": "落入存储区",
				"kb.searchPreview": "检索预览",
				"kb.searchPh": "关键词 / 条款号 / 表头（与模型 kb_search 相同的 MiniSearch BM25）",
				"kb.search": "检索",
				"kb.noHits": "无命中。",
				"kb.score": "分值 {n}",
				"kb.entries": "条目（{n} 个）",
				"kb.entriesLead": "每行是一份原文档。点名称用右侧同一套文件预览打开解析稿 Markdown（可改，保存后重建切片）。分类下可建子目录归类（例如规范 → COTO 2020）；入库时能认出 COTO / COLTO / FIDIC 章节名会自动归入。每行「归入」可改挂到哪个节点。MinerU 表若仍露出 HTML 标签，点「全部重建」收成 Markdown 表。预览若是整页一段、词中空格，那是抽文本墙：回主对话贴上 PDF，发送「{say}」，或点「MinerU 重解析」。打勾「本次任务选用」即时生效。已选用 {n} 条。",
				"kb.empty": "知识库为空。预置方法标准与范文会在首次使用时自动入库；也可以在上方导入规范、范文，或把你编好的文档导入为用户模板。",
				"kb.taskSelect": "本次任务选用",
				"kb.openPreview": "打开解析稿预览",
				"kb.ready": "已入知识库",
				"kb.fidelityTitle": "索引只存条款地址；阅读时从解析稿按偏移切片",
				"kb.inTask": "本次任务",
				"kb.seeded": "预置",
				"kb.home": "归入",
				"kb.homeTitle": "归入子目录",
				"kb.unfiled": "未归类",
				"kb.newFolder": "新建子目录…",
				"kb.reparseMineru": "MinerU 重解析",
				"kb.reparseTitle": "跳过本机文本层，用 MinerU 重做排版稿并重建切片",
				"kb.export": "导出",
				"kb.exportTitle": "导出为本应用传递包（.apkb），其他工具无法打开",
				"kb.delete": "删除",
				"kb.count": "{n} 个",
				"kb.addFolder": "新增子目录",
				"kb.addFolderTitle": "在此分类下新建子目录，用来归类入库文件",
				"kb.folderOk": "新建",
				"kb.folderCancel": "取消",
				"kb.confirmOk": "确定",
				"kb.exportFolder": "导出此目录",
				"kb.exportFolderTitle": "把此子目录下已入库文件打成一个传递包",
				"kb.deleteFolder": "删除子目录",
				"kb.deleteFolderTitle": "删除子目录，文件留在本分类下",
				"kb.emptyFolder": "空目录。用文件行的「归入」挂进来。",
				"kb.skills": "本机技能（{n} 个）",
				"kb.skillsLead": "这里是你装在本机技能目录里的方法（$DSH_HOME/skills），不是出厂捆绑技能。导出同样打成 .apkb，对方导入后热加载，不用重装应用。",
				"kb.skillsEmpty": "还没有本机技能。把方法沉淀成技能后会出现在这里。",
				"kb.exportSkillTitle": "导出为本应用传递包",
				"kb.oldHostMineru": "当前窗口还是旧宿主：MinerU Token 保存不会落盘。请关掉 Agent Pi DSH 再打开（刷新不够）。",
				"kb.ingestedOk": "知识库入库成功：{names}",
				"kb.transferEntries": "{n} 个知识条目",
				"kb.transferSkills": "{n} 个技能",
				"kb.transferEmpty": "空",
				"kb.transferImported": "已导入传递包：{parts}{detail}",
				"kb.transferSaved": "传递包已写入本机。只可用 Agent Pi DSH 打开 .apkb。",
				"kb.stagedNotice": "已落入原始文档区：{name}。点「解析入库」开始处理。",
				"kb.skipUnchanged": "内容未变化，已选用到本次任务：{name}。下一轮发送立即生效，无需重启。",
				"kb.replacedTask": "已重建并选用到本次任务：{name}。下一轮发送立即生效，无需重启。",
				"kb.ingestedTask": "已入库并选用到本次任务：{name}。下一轮发送立即生效，无需重启。",
				"kb.needFile": "请先选择要入库的文件",
				"kb.badTypes": "请选择 PDF、Word、Excel、PPT、图片、.md / .txt / .json，或本应用传递包 .apkb。",
				"kb.skippedTypes": "已跳过不支持的格式：{names}",
				"kb.needToken": "请填写 MinerU Token",
				"kb.saveNoDisk": "保存没有写到本机。刷新不够，当前窗口还是旧宿主。请关掉 Agent Pi DSH 再打开，然后重新粘贴并点保存。",
				"kb.oldHostSave": "当前窗口还是旧宿主，Token 接口还不存在。请关掉 Agent Pi DSH 再打开后再保存（刷新不够）。",
				"kb.needTokenOrSave": "请先粘贴 Token，或先保存后再验证",
				"kb.probeMissing": "验证接口还不存在。请关掉 Agent Pi DSH 再打开后再试（刷新不够）。",
				"kb.cleared": "已清除本机 MinerU Token",
				"kb.clearFailed": "清除失败。当前窗口还是旧宿主，请关掉 Agent Pi DSH 再打开。",
				"kb.parseRetry": "解析失败，请重新选择该文件入库",
				"kb.deleteEntryConfirm": "删除知识库条目「{name}」？索引与托管副本会一起删除{seeded}。",
				"kb.deleteSeeded": "；预置条目删除后不会自动恢复",
				"kb.deleted": "已删除 {slug}",
				"kb.reindexed": "已重建 {n} 个条目{missing}",
				"kb.missingSrc": "；缺源：{list}",
				"kb.folderPrompt": "子目录名称，例如 COTO 2020",
				"kb.folderCreated": "已新增子目录「{name}」",
				"kb.deleteFolderConfirm": "删除子目录「{name}」？文件仍留在「{category}」下，不会删文件。",
				"kb.folderDeleted": "已删除子目录「{name}」",
				"kb.exported": "已导出传递包 {name}。只可用本应用导入，其他工具打不开。",
				"kb.newFolderPrompt": "新建子目录，例如 COTO 2020",
				"kb.parseStarted": "已开始解析 {n} 个文件。MinerU 可能较久，请看下方进度。",
				"kb.parseNone": "没有新的解析任务。",
				"kb.cat.规范": "规范",
				"kb.cat.合同": "合同",
				"kb.cat.范文": "范文",
				"kb.cat.方法标准": "方法标准",
				"kb.cat.用户模板": "用户模板",
				"kb.cat.用户模版": "用户模板",
				"kb.cat.自定义": "自定义",
				"kb.cat.未分类": "未分类",
				"kb.hint.用户模板": "勾选后，本轮写作复刻其格式、大纲与内容深度",
				"mm.title": "模块管理",
				"mm.lead": "本页用来看已上线的模块、开关和拷贝。新模块不要在这里填字段，到下面的创造模式进对话。",
				"mm.lead2": "内置投标不会被改写。进行中的老项目不会自动改盘面。",
				"mm.designTitle": "回到对话，用人机交互生成完整工作台模块包",
				"mm.design": "去对话里创造",
				"mm.createTitle": "模块创造模式",
				"mm.createLead": "不要先导入 JSON。点下面一条路，本应用会进入 DSH 原生「创造模式」，用对话把这次做成的成果和修订经验沉淀为完整业务模块包：顶栏、阶段监控、资料登记、流程控制、配套方法和知识库。",
				"mm.createWarn": "原生创造模式只是创作驾驶舱，最终保存的是专业工作台业务模块，不会改 DSH 官方预设。当前对话为空时原地切换；已有历史时会新建创造模式对话。",
				"mm.createAdvanced": "只有已经拿到本应用校验过的模块定义时，才在这里粘贴。普通使用请走上面的创造对话。",
				"mm.packNotJson": "完整模块包，不是一段 JSON",
				"mm.pickKind": "选你们属于哪一种。选完回到对话，用大白话问一两句；模型直接装上，你不用粘贴定义。",
				"mm.card.distill": "做过一单，照这个来",
				"mm.card.distillBody": "把这次对话里已经认可的成果，整理成以后同类工作的标准。范文进知识库，做法记下来。",
				"mm.card.copy": "步骤和投标全流程一样，规矩不同",
				"mm.card.copyBody": "沿用当前投标流程的阶段和人工确认门禁，拷贝一份，再挂上你们的评分办法、组价表或投标函。",
				"mm.card.custom": "步骤就不一样",
				"mm.card.customBody": "例如先资格再技术再商务、没有组价。用中文说清几步，新标签和监控条按这几步画。",
				"mm.advanced": "高级 · 粘贴模块定义（开发者）",
				"mm.installing": "安装中…",
				"mm.install": "校验并安装",
				"mm.copyTitle": "拷贝为自建模块",
				"mm.copyLead": "从「{name}」复制阶段、技能和总报告门槛。内置投标不会被改写；副本保存后立刻出现在顶栏，并可继续改阶段。",
				"mm.labelZh": "中文名",
				"mm.moduleId": "模块 id（小写英文，不能用 tender / delivery / investment）",
				"mm.cancel": "取消",
				"mm.copying": "拷贝中…",
				"mm.copyOpen": "拷贝并打开编辑器",
				"mm.copyLive": "拷贝并上线",
				"mm.editTitle": "编辑模块 · {name}",
				"mm.editLead": "可增删改阶段、调整顺序和总报告门槛。保存即覆盖这份自建定义。进行中项目不会自动迁盘面。",
				"mm.labelEn": "英文名（可选）",
				"mm.setupStage": "开工阶段",
				"mm.kbPack": "规范包",
				"mm.kbPackLead": "挂你们公司的规范、组价表、投标函范文。不改阶段结构。勾选后阶段稿只点名这些知识库条目，不再带出厂范文的磁盘路径。",
				"mm.kbOwnOnly": "只用勾选的知识库（不带出厂范文）",
				"mm.kbEmpty": "知识库还是空的。先到「知识库」页导入规范或范文，再回到这里勾选。",
				"mm.area.analysis": "解析 / 资料阶段",
				"mm.area.pricing": "组价阶段",
				"mm.area.planning": "策划出稿阶段",
				"mm.stageN": "阶段 {n}",
				"mm.moveUp": "上移",
				"mm.moveDown": "下移",
				"mm.deleteStage": "删除阶段",
				"mm.stageId": "阶段 id（小写英文）",
				"mm.stageZh": "阶段中文名",
				"mm.stageHint": "一句话提示",
				"mm.stagePrompt": "阶段要求（写给模型看）",
				"mm.skillSlugs": "技能 slug（逗号分隔）",
				"mm.reviewSlugs": "评审技能 slug（逗号分隔，可空）",
				"mm.reviewPolicy": "审查范围",
				"mm.reviewRisk": "按风险 / 变更 / 抽样审查",
				"mm.reviewAll": "逐文件全部审查",
				"mm.approvalGate": "本阶段需要人工确认后才能继续",
				"mm.approvalPrompt": "确认事项（显示给用户）",
				"mm.approveLabel": "确认按钮文字",
				"mm.rejectLabel": "暂停 / 退回按钮文字（可空）",
				"mm.binding": "知识库绑定",
				"mm.bindNone": "不绑定",
				"mm.bindAnalysis": "解析 analysis",
				"mm.bindPricing": "组价 pricing",
				"mm.bindPlanning": "策划 planning",
				"mm.listsSources": "按册/同名打包任务（pdf+docx 算一份）",
				"mm.summaryFile": "总报告文件名（空=不设门槛）",
				"mm.summaryOutline": "总报告大纲（一行一条）",
				"mm.addStage": "新增阶段",
				"mm.saving": "保存中…",
				"mm.saveLive": "保存并上线",
				"mm.list": "模块（{n}）",
				"mm.builtin": "内置",
				"mm.custom": "自建",
				"mm.stageCount": "{n} 个阶段",
				"mm.collapse": "收起阶段",
				"mm.expand": "查看阶段",
				"mm.copyThenEdit": "拷贝后编辑",
				"mm.editStages": "编辑阶段",
				"mm.copyAsCustom": "拷贝为自建",
				"mm.defFile": "定义文件",
				"mm.defFileTitle": "在文件管理器中查看定义文件",
				"mm.delete": "删除",
				"mm.enable": "启用",
				"mm.disable": "停用",
				"mm.noStages": "此模块没有阶段定义",
				"mm.loadFailed": "加载失败的定义文件",
				"mm.enabled": "已启用 {name}",
				"mm.disabled": "已停用 {name}",
				"mm.deleteConfirm": "删除自建模块「{name}」？该模块下已有项目会失去流程定义（数据保留）。",
				"mm.deleted": "已删除 {id}",
				"mm.jsonFail": "JSON 解析失败：{err}",
				"mm.installed": "已安装模块 {id}",
				"mm.copySuffix": "（副本）",
				"mm.copied": "已拷贝为自建模块 {id}，顶栏现已可见",
				"mm.builtinLocked": "内置模块不能直接改。先拷贝一份自建模块，再改副本的阶段。进行中项目不会自动迁过去。",
				"mm.saveConfirm": "保存后立即生效。改阶段 id 不会自动迁移进行中项目的盘面。",
				"mm.saved": "已保存模块 {id}",
				"mm.markLists": "按册/同名打包任务",
				"mm.markSummary": "总报告：{name}",
				"mm.markSkills": "技能 {list}",
				"mm.markReview": "评审 {list}",
				"lang.zh": "中文",
				"lang.en": "English",
				"lang.title": "语言",
				"lang.switchFailed": "语言切换失败，请重试"
			},
			en: {
				"workbench.title": "Workbench",
				"files.openExplorer": "Open in File Explorer",
				"files.opening": "Opening File Explorer…",
				"files.openFailed": "Could not open folder",
				"files.noCwd": "No workspace path yet",
				"files.uploadFiles": "Upload files",
				"files.uploadFolder": "Upload folder",
				"files.title": "Files",
				"files.official": "Work results",
				"files.officialName": "Official Outputs",
				"files.officialEmpty": "No official outputs yet. Edited reports and maps from this session are copied here automatically.",
				"files.officialHint": "Official outputs from the session and workbench appear here. The model does not pick this folder.",
				"files.workspace": "Workspace",
				"files.uploads": "Uploads",
				"files.pickWorkspace": "Choose a workspace first",
				"files.collapse": "Collapse files",
				"files.expand": "Expand files",
				"files.refresh": "Refresh",
				"files.addFolder": "Add a folder path (do not upload the files)",
				"files.resize": "Drag to resize",
				"nav.kb": "Knowledge base",
				"nav.kbTitle": "Local knowledge base: specs, contracts, exemplars, and user templates, indexed by document structure",
				"wb.back": "Back to chat",
				"wb.noCwd": "No workspace selected. Chat still uses the default path; the workbench only speeds up stage prep.",
				"wb.kb": "Knowledge base",
				"wb.kbTitle": "Shared specs, contracts, exemplars, and user templates. Checked user templates set this round’s format and depth.",
				"wb.modules": "Modules",
				"wb.modulesTitle": "Create, edit and manage your workbenches. Conversation-assisted design is optional.",
				"wb.refresh": "Refresh",
				"wb.adopt": "Upgrade current work",
				"wb.adoptTitle": "Register this session workspace as a project in the selected module. No new folder is created.",
				"wb.create": "New project",
				"wb.upgrade": "Upgrade current work",
				"wb.landing": "These are the steps for this workflow. Start a project or upgrade the current work so the monitor bar appears and stays in sync.",
				"wb.projects": "Projects",
				"wb.pickProject": "Select a project",
				"wb.moduleErrors": "{n} module definition file(s) failed to load. See Modules.",
				"module.tender": "Tender process",
				"module.delivery": "Delivery control",
				"module.investment": "Investment review",
				"create.close": "Close",
				"create.titleAdopt": "Upgrade current work to a professional project",
				"create.titleNew": "New {name} project",
				"create.hintAdopt": "Keep this session workspace and existing official outputs. Add a professional board only. Choose tender, delivery, investment review, or any custom module.",
				"create.hintNew": "Use the current chat runtime. Create a separate project folder, set the source boundary, and follow the professional workflow. You may attach an enterprise productivity file; it outranks web research.",
				"create.whichModule": "Which module should this work join? Existing official outputs stay as they are.",
				"create.step.module": "Choose module",
				"create.step.info": "Project info",
				"create.step.folder": "Project folder",
				"create.step.files": "Source files",
				"create.step.confirmAdopt": "Confirm upgrade",
				"create.step.confirmNew": "Confirm workflow",
				"session.archive": "Archive conversation",
				"session.archiveTitle": "Archive this conversation. Open the full record from Archive in the sidebar. You can still delete it after archiving.",
				"session.archiveFailed": "Could not archive",
				"session.delete": "Delete conversation",
				"session.deleteConfirm": "Remove it from the sidebar and Archive? The log stays on disk but will no longer be listed.",
				"session.deleteFailed": "Could not delete",
				"archive.title": "Archive",
				"archive.lead": "Archive finished workspaces so they leave the live list. Open a row to read the full conversation. You can still delete archived workspaces and chats.",
				"archive.empty": "Nothing archived yet. Choose Archive workspace in the sidebar menu, or Archive session on a single chat.",
				"archive.open": "Open full record",
				"archive.delete": "Delete",
				"archive.ungrouped": "Ungrouped",
				"archive.workspace": "Archive workspace",
				"archive.workspaceConfirm": "Archive this workspace? It and its conversations will move from the live list to Archive. You can still open the full records or delete them later.",
				"archive.workspaceFailed": "Could not archive the workspace",
				"archive.workspaceLive": "Workspace is still active",
				"archive.workspaceEmpty": "This workspace has no conversations.",
				"archive.deleteWorkspace": "Delete workspace",
				"archive.deleteWorkspaceConfirm": "Remove this workspace from the list? The folder and archived conversations stay on disk.",
				"kb.title": "Local knowledge base",
				"kb.refresh": "Refresh",
				"kb.reindexAll": "Rebuild all",
				"kb.reindexing": "Rebuilding…",
				"kb.reindexTitle": "Recut chunks from the original path (if it still exists) and refresh the index",
				"kb.import": "Import",
				"kb.tokenOk": "Token valid",
				"kb.tokenBad": "Token invalid",
				"kb.mineruSaved": "MinerU saved",
				"kb.mineruMissing": "MinerU not configured",
				"kb.mineruNeedRestart": "Restart the host to use MinerU",
				"kb.path1Title": "Path 1 · Import on this page",
				"kb.path1Body": "Use Choose files or drop several files here. They land in the staging area below and are not parsed yet. PDFs with a text layer are extracted locally (fast). Scans and complex layouts wait for Parse into library, which uses MinerU. MinerU HTML tables become Markdown tables; already imported entries only need Rebuild all. The index cuts on the document’s own chapters, sections, and clauses.",
				"kb.path2Title": "Path 2 · Import from chat",
				"kb.path2Warn": "Dropping a PDF into the main chat without a message does not add it to the knowledge base. After attaching the file, send this line:",
				"kb.path2After": "You can also say: 知识库, 入库, 知识包, 准确整理, 完整内容, 全文转录. After the model writes a “…-知识包” folder, right-click that folder or pack.json in the files rail and choose Import knowledge pack. It is searchable immediately. Ordinary files can still use Import to knowledge base — the same parser as this page.",
				"kb.tplTitle": "User templates · Match the layout",
				"kb.tplBody": "Import a document you already wrote well as a User template, then check Use in this task. This round’s draft copies its format, outline, section order, and depth. Project facts still come from specs, contracts, and this project’s files — do not copy numbers, place names, or contract numbers from the template. A file name ending in “模板” or “template” is filed here automatically from the files rail.",
				"kb.packTitle": "Transfer pack · This app only",
				"kb.packBody": "Every knowledge file, user template, and local skill can Export to .apkb. That is a sealed pack for this app; zip, Office, and Notepad cannot open it. The other person chooses Import transfer pack on this page, and entries return to their original category and folder (for example Specs → COTO 2020).",
				"kb.pickTitle": "Chosen files appear below immediately and are not parsed yet",
				"kb.picking": "Saving to storage…",
				"kb.pickFiles": "Choose files",
				"kb.importPackTitle": "Import an Agent Pi transfer pack (.apkb). Other tools cannot read it.",
				"kb.importing": "Importing…",
				"kb.importPack": "Import transfer pack",
				"kb.parseTitle": "Parse files already in the staging area and write them into the knowledge base",
				"kb.parsing": "Parsing…",
				"kb.parseIn": "Parse into library",
				"kb.category": "Category",
				"kb.customCategory": "Custom category…",
				"kb.customCategoryPh": "Custom category name",
				"kb.customNamePh": "Custom name (optional; defaults to the file name)",
				"kb.thisPick": "This selection: {name}",
				"kb.multiHint": "Multiple files are allowed. They land in the staging area first and are not parsed yet.",
				"kb.parseFailed": "Parse failed",
				"kb.stagedWait": "In the staging area, waiting to be parsed",
				"kb.progress": "Progress {n}%",
				"kb.parsingChip": "Parsing",
				"kb.failedChip": "Failed",
				"kb.pendingChip": "Pending",
				"kb.retry": "Retry",
				"kb.remove": "Remove",
				"kb.landing": "Selected, saving to the staging area…",
				"kb.landingProgress": "Saving to the staging area…",
				"kb.mineruSummary": "MinerU token (large files / high-accuracy extract)",
				"kb.mineruCurrent": "Current: {hint}. The full token is not shown again.",
				"kb.mineruSavedHint": "Saved",
				"kb.mineruUnconfigured": "Not configured. Files under 10MB can use the anonymous light API; larger files need a token. Apply at https://mineru.net/apiManage/token",
				"kb.mineruOldHost": "This window is still the old host. Saving a token here will not persist. Quit Agent Pi DSH completely, open it again, then paste and save.",
				"kb.mineruTokenPh": "Paste the MinerU token, then save",
				"kb.saving": "Saving…",
				"kb.saveToken": "Save token",
				"kb.probeTitle": "Check MinerU authentication. This does not start a parse job.",
				"kb.probing": "Checking…",
				"kb.probe": "Check token",
				"kb.clear": "Clear",
				"kb.mineruOcr": "PDFs with a text layer skip OCR; scanned pages turn OCR on. Files over the official page or size limit are split, parsed in series, and merged into one entry.",
				"kb.pastePath": "Or paste an existing file path",
				"kb.pastePathPh": "Original file path, knowledge-pack folder, or MinerU output folder",
				"kb.staging": "Saving…",
				"kb.stage": "Save to storage",
				"kb.searchPreview": "Search preview",
				"kb.searchPh": "Keyword / clause number / table header (same MiniSearch BM25 as kb_search)",
				"kb.search": "Search",
				"kb.noHits": "No hits.",
				"kb.score": "Score {n}",
				"kb.entries": "Entries ({n})",
				"kb.entriesLead": "Each row is one source document. Click the name to open the parsed Markdown in the same files preview on the right (you can edit it; save rebuilds the chunks). Categories can have folders (for example Specs → COTO 2020). Import can file COTO / COLTO / FIDIC chapter names automatically. Use File under on a row to change the folder. If MinerU tables still show HTML tags, choose Rebuild all to turn them into Markdown tables. If the preview is one wall of text with spaces inside words, that is a raw text extract: attach the PDF in the main chat and send “{say}”, or choose Reparse with MinerU. Checking Use in this task takes effect immediately. {n} selected.",
				"kb.empty": "The knowledge base is empty. Preset method standards and exemplars are imported on first use. You can also import specs or exemplars above, or import a document you already wrote as a user template.",
				"kb.taskSelect": "Use in this task",
				"kb.openPreview": "Open the parsed markdown preview",
				"kb.ready": "In library",
				"kb.fidelityTitle": "The index stores clause addresses only. Reading slices the parsed manuscript by offset.",
				"kb.inTask": "This task",
				"kb.seeded": "Preset",
				"kb.home": "File under",
				"kb.homeTitle": "Move into a folder",
				"kb.unfiled": "Unfiled",
				"kb.newFolder": "New folder…",
				"kb.reparseMineru": "Reparse with MinerU",
				"kb.reparseTitle": "Skip the local text layer. Rebuild the layout manuscript and chunks with MinerU.",
				"kb.export": "Export",
				"kb.exportTitle": "Export as an app transfer pack (.apkb). Other tools cannot open it.",
				"kb.delete": "Delete",
				"kb.count": "{n}",
				"kb.addFolder": "Add folder",
				"kb.addFolderTitle": "Create a folder in this category to group imported files",
				"kb.folderOk": "Create",
				"kb.folderCancel": "Cancel",
				"kb.confirmOk": "OK",
				"kb.exportFolder": "Export this folder",
				"kb.exportFolderTitle": "Pack the imported files in this folder into one transfer pack",
				"kb.deleteFolder": "Delete folder",
				"kb.deleteFolderTitle": "Delete the folder. Files stay in this category.",
				"kb.emptyFolder": "Empty folder. Use File under on a file row to move it here.",
				"kb.skills": "Local skills ({n})",
				"kb.skillsLead": "These are methods in your local skills folder ($DSH_HOME/skills), not factory-bundled skills. Export also writes .apkb. The other person can import and hot-load them without reinstalling the app.",
				"kb.skillsEmpty": "No local skills yet. Methods saved as skills appear here.",
				"kb.exportSkillTitle": "Export as an app transfer pack",
				"kb.oldHostMineru": "This window is still the old host: saving a MinerU token will not persist. Quit Agent Pi DSH completely and open it again (refresh is not enough).",
				"kb.ingestedOk": "Imported into the knowledge base: {names}",
				"kb.transferEntries": "{n} knowledge entries",
				"kb.transferSkills": "{n} skills",
				"kb.transferEmpty": "empty",
				"kb.transferImported": "Imported transfer pack: {parts}{detail}",
				"kb.transferSaved": "The transfer pack is on this machine. Only Agent Pi DSH can open .apkb files.",
				"kb.stagedNotice": "Saved to the staging area: {name}. Choose Parse into library to start.",
				"kb.skipUnchanged": "Content unchanged. Selected for this task: {name}. The next send uses it immediately. No restart needed.",
				"kb.replacedTask": "Rebuilt and selected for this task: {name}. The next send uses it immediately. No restart needed.",
				"kb.ingestedTask": "Imported and selected for this task: {name}. The next send uses it immediately. No restart needed.",
				"kb.needFile": "Choose a file to import first",
				"kb.badTypes": "Choose a PDF, Word, Excel, PowerPoint, image, .md / .txt / .json, or an .apkb transfer pack.",
				"kb.skippedTypes": "Skipped unsupported formats: {names}",
				"kb.needToken": "Enter a MinerU token",
				"kb.saveNoDisk": "The save did not reach disk. Refresh is not enough; this window is still the old host. Quit Agent Pi DSH, open it again, then paste and save.",
				"kb.oldHostSave": "This window is still the old host, so the token API is missing. Quit Agent Pi DSH, open it again, then save (refresh is not enough).",
				"kb.needTokenOrSave": "Paste a token first, or save it before checking",
				"kb.probeMissing": "The check API is missing. Quit Agent Pi DSH, open it again, then retry (refresh is not enough).",
				"kb.cleared": "Cleared the local MinerU token",
				"kb.clearFailed": "Could not clear. This window is still the old host. Quit Agent Pi DSH and open it again.",
				"kb.parseRetry": "Parse failed. Choose the file again to import.",
				"kb.deleteEntryConfirm": "Delete knowledge entry “{name}”? The index and hosted copy are removed{seeded}.",
				"kb.deleteSeeded": "; a preset entry will not come back automatically",
				"kb.deleted": "Deleted {slug}",
				"kb.reindexed": "Rebuilt {n} entries{missing}",
				"kb.missingSrc": "; missing source: {list}",
				"kb.folderPrompt": "Folder name, for example COTO 2020",
				"kb.folderCreated": "Created folder “{name}”",
				"kb.deleteFolderConfirm": "Delete folder “{name}”? Files stay under “{category}”. Files are not deleted.",
				"kb.folderDeleted": "Deleted folder “{name}”",
				"kb.exported": "Exported transfer pack {name}. Only this app can import it.",
				"kb.newFolderPrompt": "New folder name, for example COTO 2020",
				"kb.parseStarted": "Started parsing {n} file(s). MinerU can take a while; watch the progress below.",
				"kb.parseNone": "No new parse jobs.",
				"kb.cat.规范": "Specs",
				"kb.cat.合同": "Contracts",
				"kb.cat.范文": "Exemplars",
				"kb.cat.方法标准": "Method standards",
				"kb.cat.用户模板": "User templates",
				"kb.cat.用户模版": "User templates",
				"kb.cat.自定义": "Custom",
				"kb.cat.未分类": "Uncategorized",
				"kb.hint.用户模板": "When checked, this round copies its format, outline, and depth",
				"mm.title": "Modules",
				"mm.lead": "Review live modules, toggle them, and copy them. Do not fill fields here for a new module. Use Create mode below to continue in chat.",
				"mm.lead2": "Built-in tender is not rewritten. Live projects do not migrate their boards automatically.",
				"mm.designTitle": "Return to chat and generate a complete workbench module pack through conversation",
				"mm.design": "Create in chat",
				"mm.createTitle": "Module create mode",
				"mm.createLead": "Do not start by importing JSON. Pick a path below and this app opens DSH native Create mode, where conversation distils accepted outputs and revision experience into a complete business module pack: top bar, stage monitor, source registration, workflow gates, methods, and knowledge.",
				"mm.createWarn": "Native Create mode is the authoring cockpit; the saved product is a professional-workbench business module and never edits a shipped DSH preset. A blank chat switches in place; a chat with history opens a new Create-mode session.",
				"mm.createAdvanced": "Paste here only when you already have a module definition this app has validated. Everyday use should go through the create conversation above.",
				"mm.packNotJson": "A complete module pack, not a JSON snippet",
				"mm.pickKind": "Pick the case that matches you. Then return to chat and ask in plain language. The model installs it; you do not paste a definition.",
				"mm.card.distill": "We finished one job — use this as the standard",
				"mm.card.distillBody": "Turn the accepted results from this chat into the standard for later work of the same kind. Exemplars go to the knowledge base; the method is written down.",
				"mm.card.copy": "Same steps as Tender process, different rules",
				"mm.card.copyBody": "Keep the current tender stages and human-approval gates, then attach your scoring rules, rate tables, or letters to a copy.",
				"mm.card.custom": "The steps are different",
				"mm.card.customBody": "For example qualification, then technical, then commercial — no pricing. Say the steps in plain language. The new tab and monitor bar follow those steps.",
				"mm.advanced": "Advanced · Paste a module definition (developers)",
				"mm.installing": "Installing…",
				"mm.install": "Validate and install",
				"mm.copyTitle": "Copy as a custom module",
				"mm.copyLead": "Copy stages, skills, and summary-report gates from “{name}”. Built-in tender is not rewritten. The copy appears in the top bar as soon as it is saved, and you can keep editing stages.",
				"mm.labelZh": "Chinese name",
				"mm.moduleId": "Module id (lowercase English; cannot be tender, delivery, or investment)",
				"mm.cancel": "Cancel",
				"mm.copying": "Copying…",
				"mm.copyOpen": "Copy and open editor",
				"mm.copyLive": "Copy and go live",
				"mm.editTitle": "Edit module · {name}",
				"mm.editLead": "Add, remove, or edit stages, reorder them, and set summary-report gates. Saving overwrites this custom definition. Live projects do not migrate their boards.",
				"mm.labelEn": "English name (optional)",
				"mm.setupStage": "Kickoff stage",
				"mm.kbPack": "Spec pack",
				"mm.kbPackLead": "Attach your company specs, rate tables, and letter exemplars. Stage structure stays the same. When checked, stage drafts name only these knowledge entries and no longer carry factory exemplar disk paths.",
				"mm.kbOwnOnly": "Use only the checked knowledge entries (no factory exemplars)",
				"mm.kbEmpty": "The knowledge base is still empty. Import specs or exemplars on the Knowledge base page, then come back and check them.",
				"mm.area.analysis": "Analysis / source stage",
				"mm.area.pricing": "Pricing stage",
				"mm.area.planning": "Planning / drafting stage",
				"mm.stageN": "Stage {n}",
				"mm.moveUp": "Move up",
				"mm.moveDown": "Move down",
				"mm.deleteStage": "Delete stage",
				"mm.stageId": "Stage id (lowercase English)",
				"mm.stageZh": "Stage Chinese name",
				"mm.stageHint": "One-line hint",
				"mm.stagePrompt": "Stage requirements (for the model)",
				"mm.skillSlugs": "Skill slugs (comma-separated)",
				"mm.reviewSlugs": "Review skill slugs (comma-separated, optional)",
				"mm.reviewPolicy": "Review scope",
				"mm.reviewRisk": "Risk / change / sample review",
				"mm.reviewAll": "Review every file",
				"mm.approvalGate": "Require human approval before the next stage",
				"mm.approvalPrompt": "Decision prompt shown to the user",
				"mm.approveLabel": "Approve button label",
				"mm.rejectLabel": "Pause / reject button label (optional)",
				"mm.binding": "Knowledge binding",
				"mm.bindNone": "None",
				"mm.bindAnalysis": "Analysis",
				"mm.bindPricing": "Pricing",
				"mm.bindPlanning": "Planning",
				"mm.listsSources": "Pack tasks by volume / same name (pdf+docx count as one)",
				"mm.summaryFile": "Summary report file name (empty = no gate)",
				"mm.summaryOutline": "Summary outline (one item per line)",
				"mm.addStage": "Add stage",
				"mm.saving": "Saving…",
				"mm.saveLive": "Save and go live",
				"mm.list": "Modules ({n})",
				"mm.builtin": "Built-in",
				"mm.custom": "Custom",
				"mm.stageCount": "{n} stages",
				"mm.collapse": "Hide stages",
				"mm.expand": "View stages",
				"mm.copyThenEdit": "Copy then edit",
				"mm.editStages": "Edit stages",
				"mm.copyAsCustom": "Copy as custom",
				"mm.defFile": "Definition file",
				"mm.defFileTitle": "Reveal the definition file in File Explorer",
				"mm.delete": "Delete",
				"mm.enable": "Enable",
				"mm.disable": "Disable",
				"mm.noStages": "This module has no stages",
				"mm.loadFailed": "Definition files that failed to load",
				"mm.enabled": "Enabled {name}",
				"mm.disabled": "Disabled {name}",
				"mm.deleteConfirm": "Delete custom module “{name}”? Existing projects under it lose the workflow definition. Data is kept.",
				"mm.deleted": "Deleted {id}",
				"mm.jsonFail": "JSON parse failed: {err}",
				"mm.installed": "Installed module {id}",
				"mm.copySuffix": " (copy)",
				"mm.copied": "Copied as custom module {id}. It is now in the top bar.",
				"mm.builtinLocked": "Built-in modules cannot be edited directly. Copy one as a custom module, then edit the copy. Live projects do not migrate automatically.",
				"mm.saveConfirm": "Saving takes effect immediately. Changing a stage id does not migrate live project boards.",
				"mm.saved": "Saved module {id}",
				"mm.markLists": "Pack tasks by volume / same name",
				"mm.markSummary": "Summary: {name}",
				"mm.markSkills": "Skills {list}",
				"mm.markReview": "Review {list}",
				"lang.zh": "中文",
				"lang.en": "English",
				"lang.title": "Language",
				"lang.switchFailed": "Could not switch language. Please try again."
			}
		};
		const AP_LANGUAGE_DEFINITIONS = [
			{
				id: "zh",
				label: "中文",
				documentLang: "zh-CN",
				fallback: "en"
			},
			{
				id: "en",
				label: "English",
				documentLang: "en",
				fallback: "en"
			},
			{
				id: "es",
				label: "Español",
				documentLang: "es",
				fallback: "en"
			},
			{
				id: "fr",
				label: "Français",
				documentLang: "fr",
				fallback: "en"
			},
			{
				id: "de",
				label: "Deutsch",
				documentLang: "de",
				fallback: "en"
			},
			{
				id: "ja",
				label: "日本語",
				documentLang: "ja",
				fallback: "en"
			},
			{
				id: "ko",
				label: "한국어",
				documentLang: "ko",
				fallback: "en"
			},
			{
				id: "pt",
				label: "Português",
				documentLang: "pt",
				fallback: "en"
			},
			{
				id: "ru",
				label: "Русский",
				documentLang: "ru",
				fallback: "en"
			},
			{
				id: "ar",
				label: "العربية",
				documentLang: "ar",
				fallback: "en",
				rtl: true
			}
		];
		Object.assign(AP_I18N.zh, { "codex.title": "Codex 智能体" });
		Object.assign(AP_I18N.en, { "codex.title": "Codex Agent" });
		Object.assign(AP_I18N, {
			es: {
				"workbench.title": "Espacio de trabajo",
				"files.title": "Archivos",
				"files.official": "Resultados",
				"files.workspace": "Área de trabajo",
				"files.uploads": "Cargas",
				"files.refresh": "Actualizar",
				"files.collapse": "Contraer archivos",
				"files.expand": "Expandir archivos",
				"nav.kb": "Base de conocimiento",
				"wb.back": "Volver al chat",
				"wb.kb": "Base de conocimiento",
				"wb.modules": "Módulos",
				"wb.refresh": "Actualizar",
				"wb.adopt": "Convertir trabajo actual",
				"wb.create": "Nuevo proyecto",
				"wb.projects": "Proyectos",
				"module.tender": "Proceso de licitación",
				"module.delivery": "Control de ejecución",
				"module.investment": "Análisis de inversión",
				"create.close": "Cerrar",
				"session.archive": "Archivar conversación",
				"session.delete": "Eliminar conversación",
				"archive.title": "Archivo",
				"archive.open": "Abrir registro",
				"archive.delete": "Eliminar",
				"kb.title": "Base de conocimiento local",
				"kb.refresh": "Actualizar",
				"kb.import": "Importar",
				"kb.search": "Buscar",
				"mm.title": "Módulos",
				"codex.title": "Agente Codex",
				"lang.title": "Idioma"
			},
			fr: {
				"workbench.title": "Espace de travail",
				"files.title": "Fichiers",
				"files.official": "Résultats",
				"files.workspace": "Espace de travail",
				"files.uploads": "Téléversements",
				"files.refresh": "Actualiser",
				"files.collapse": "Réduire les fichiers",
				"files.expand": "Développer les fichiers",
				"nav.kb": "Base de connaissances",
				"wb.back": "Retour au chat",
				"wb.kb": "Base de connaissances",
				"wb.modules": "Modules",
				"wb.refresh": "Actualiser",
				"wb.adopt": "Convertir le travail actuel",
				"wb.create": "Nouveau projet",
				"wb.projects": "Projets",
				"module.tender": "Processus d'appel d'offres",
				"module.delivery": "Contrôle d'exécution",
				"module.investment": "Analyse d'investissement",
				"create.close": "Fermer",
				"session.archive": "Archiver la conversation",
				"session.delete": "Supprimer la conversation",
				"archive.title": "Archives",
				"archive.open": "Ouvrir le dossier",
				"archive.delete": "Supprimer",
				"kb.title": "Base de connaissances locale",
				"kb.refresh": "Actualiser",
				"kb.import": "Importer",
				"kb.search": "Rechercher",
				"mm.title": "Modules",
				"codex.title": "Agent Codex",
				"lang.title": "Langue"
			},
			de: {
				"workbench.title": "Arbeitsbereich",
				"files.title": "Dateien",
				"files.official": "Ergebnisse",
				"files.workspace": "Arbeitsbereich",
				"files.uploads": "Uploads",
				"files.refresh": "Aktualisieren",
				"files.collapse": "Dateien einklappen",
				"files.expand": "Dateien ausklappen",
				"nav.kb": "Wissensbasis",
				"wb.back": "Zurück zum Chat",
				"wb.kb": "Wissensbasis",
				"wb.modules": "Module",
				"wb.refresh": "Aktualisieren",
				"wb.adopt": "Aktuelle Arbeit übernehmen",
				"wb.create": "Neues Projekt",
				"wb.projects": "Projekte",
				"module.tender": "Ausschreibungsprozess",
				"module.delivery": "Ausführungskontrolle",
				"module.investment": "Investitionsprüfung",
				"create.close": "Schließen",
				"session.archive": "Unterhaltung archivieren",
				"session.delete": "Unterhaltung löschen",
				"archive.title": "Archiv",
				"archive.open": "Datensatz öffnen",
				"archive.delete": "Löschen",
				"kb.title": "Lokale Wissensbasis",
				"kb.refresh": "Aktualisieren",
				"kb.import": "Importieren",
				"kb.search": "Suchen",
				"mm.title": "Module",
				"codex.title": "Codex-Agent",
				"lang.title": "Sprache"
			},
			ja: {
				"workbench.title": "専門ワークベンチ",
				"files.title": "ファイル",
				"files.official": "成果物",
				"files.workspace": "ワークスペース",
				"files.uploads": "アップロード",
				"files.refresh": "更新",
				"files.collapse": "ファイルを閉じる",
				"files.expand": "ファイルを開く",
				"nav.kb": "ナレッジベース",
				"wb.back": "チャットに戻る",
				"wb.kb": "ナレッジベース",
				"wb.modules": "モジュール",
				"wb.refresh": "更新",
				"wb.adopt": "現在の作業を登録",
				"wb.create": "新規プロジェクト",
				"wb.projects": "プロジェクト",
				"module.tender": "入札プロセス",
				"module.delivery": "施工管理",
				"module.investment": "投資調査",
				"create.close": "閉じる",
				"session.archive": "会話をアーカイブ",
				"session.delete": "会話を削除",
				"archive.title": "アーカイブ",
				"archive.open": "記録を開く",
				"archive.delete": "削除",
				"kb.title": "ローカルナレッジベース",
				"kb.refresh": "更新",
				"kb.import": "インポート",
				"kb.search": "検索",
				"mm.title": "モジュール",
				"codex.title": "Codex エージェント",
				"lang.title": "言語"
			},
			ko: {
				"workbench.title": "전문 워크벤치",
				"files.title": "파일",
				"files.official": "작업 결과",
				"files.workspace": "작업 공간",
				"files.uploads": "업로드",
				"files.refresh": "새로 고침",
				"files.collapse": "파일 접기",
				"files.expand": "파일 펼치기",
				"nav.kb": "지식 베이스",
				"wb.back": "채팅으로 돌아가기",
				"wb.kb": "지식 베이스",
				"wb.modules": "모듈",
				"wb.refresh": "새로 고침",
				"wb.adopt": "현재 작업 등록",
				"wb.create": "새 프로젝트",
				"wb.projects": "프로젝트",
				"module.tender": "입찰 프로세스",
				"module.delivery": "시공 관리",
				"module.investment": "투자 검토",
				"create.close": "닫기",
				"session.archive": "대화 보관",
				"session.delete": "대화 삭제",
				"archive.title": "보관함",
				"archive.open": "기록 열기",
				"archive.delete": "삭제",
				"kb.title": "로컬 지식 베이스",
				"kb.refresh": "새로 고침",
				"kb.import": "가져오기",
				"kb.search": "검색",
				"mm.title": "모듈",
				"codex.title": "Codex 에이전트",
				"lang.title": "언어"
			},
			pt: {
				"workbench.title": "Área de trabalho",
				"files.title": "Arquivos",
				"files.official": "Resultados",
				"files.workspace": "Área de trabalho",
				"files.uploads": "Envios",
				"files.refresh": "Atualizar",
				"files.collapse": "Recolher arquivos",
				"files.expand": "Expandir arquivos",
				"nav.kb": "Base de conhecimento",
				"wb.back": "Voltar ao chat",
				"wb.kb": "Base de conhecimento",
				"wb.modules": "Módulos",
				"wb.refresh": "Atualizar",
				"wb.adopt": "Converter trabalho atual",
				"wb.create": "Novo projeto",
				"wb.projects": "Projetos",
				"module.tender": "Processo de licitação",
				"module.delivery": "Controle de execução",
				"module.investment": "Análise de investimento",
				"create.close": "Fechar",
				"session.archive": "Arquivar conversa",
				"session.delete": "Excluir conversa",
				"archive.title": "Arquivo",
				"archive.open": "Abrir registro",
				"archive.delete": "Excluir",
				"kb.title": "Base de conhecimento local",
				"kb.refresh": "Atualizar",
				"kb.import": "Importar",
				"kb.search": "Pesquisar",
				"mm.title": "Módulos",
				"codex.title": "Agente Codex",
				"lang.title": "Idioma"
			},
			ru: {
				"workbench.title": "Рабочая панель",
				"files.title": "Файлы",
				"files.official": "Результаты",
				"files.workspace": "Рабочая область",
				"files.uploads": "Загрузки",
				"files.refresh": "Обновить",
				"files.collapse": "Свернуть файлы",
				"files.expand": "Развернуть файлы",
				"nav.kb": "База знаний",
				"wb.back": "Назад к чату",
				"wb.kb": "База знаний",
				"wb.modules": "Модули",
				"wb.refresh": "Обновить",
				"wb.adopt": "Подключить текущую работу",
				"wb.create": "Новый проект",
				"wb.projects": "Проекты",
				"module.tender": "Тендерный процесс",
				"module.delivery": "Контроль исполнения",
				"module.investment": "Инвестиционный анализ",
				"create.close": "Закрыть",
				"session.archive": "Архивировать беседу",
				"session.delete": "Удалить беседу",
				"archive.title": "Архив",
				"archive.open": "Открыть запись",
				"archive.delete": "Удалить",
				"kb.title": "Локальная база знаний",
				"kb.refresh": "Обновить",
				"kb.import": "Импорт",
				"kb.search": "Поиск",
				"mm.title": "Модули",
				"codex.title": "Агент Codex",
				"lang.title": "Язык"
			},
			ar: {
				"workbench.title": "مساحة العمل",
				"files.title": "الملفات",
				"files.official": "النتائج",
				"files.workspace": "مساحة العمل",
				"files.uploads": "التحميلات",
				"files.refresh": "تحديث",
				"files.collapse": "طي الملفات",
				"files.expand": "توسيع الملفات",
				"nav.kb": "قاعدة المعرفة",
				"wb.back": "العودة إلى المحادثة",
				"wb.kb": "قاعدة المعرفة",
				"wb.modules": "الوحدات",
				"wb.refresh": "تحديث",
				"wb.adopt": "اعتماد العمل الحالي",
				"wb.create": "مشروع جديد",
				"wb.projects": "المشاريع",
				"module.tender": "عملية المناقصة",
				"module.delivery": "مراقبة التنفيذ",
				"module.investment": "تحليل الاستثمار",
				"create.close": "إغلاق",
				"session.archive": "أرشفة المحادثة",
				"session.delete": "حذف المحادثة",
				"archive.title": "الأرشيف",
				"archive.open": "فتح السجل",
				"archive.delete": "حذف",
				"kb.title": "قاعدة المعرفة المحلية",
				"kb.refresh": "تحديث",
				"kb.import": "استيراد",
				"kb.search": "بحث",
				"mm.title": "الوحدات",
				"codex.title": "وكيل Codex",
				"lang.title": "اللغة"
			}
		});
		for (const [locale, messages] of Object.entries(WORKFLOW_EDITOR_I18N)) Object.assign(AP_I18N[locale], messages);
		for (const [locale, messages] of Object.entries(WORKBENCH_FIELDS)) Object.assign(AP_I18N[locale], messages);
		Object.assign(AP_I18N.es, {
			"workbench.title": "Panel profesional",
			"files.workspace": "Carpeta de trabajo",
			"module.delivery": "Control de proyectos"
		});
		Object.assign(AP_I18N.fr, {
			"workbench.title": "Atelier professionnel",
			"files.workspace": "Dossier de travail",
			"module.delivery": "Pilotage de projet"
		});
		Object.assign(AP_I18N.de, {
			"workbench.title": "Facharbeitsbereich",
			"files.workspace": "Arbeitsverzeichnis",
			"module.delivery": "Projektsteuerung"
		});
		Object.assign(AP_I18N.ja, {
			"workbench.title": "専門ワークベンチ",
			"files.workspace": "作業フォルダー",
			"module.delivery": "プロジェクト管理"
		});
		Object.assign(AP_I18N.ko, {
			"workbench.title": "전문 작업대",
			"files.workspace": "작업 폴더",
			"module.delivery": "프로젝트 관리"
		});
		Object.assign(AP_I18N.pt, {
			"workbench.title": "Bancada profissional",
			"files.workspace": "Pasta de trabalho",
			"module.delivery": "Controle de projetos"
		});
		Object.assign(AP_I18N.ru, {
			"workbench.title": "Профессиональная рабочая панель",
			"files.workspace": "Рабочая папка",
			"module.delivery": "Управление проектом"
		});
		Object.assign(AP_I18N.ar, {
			"workbench.title": "لوحة العمل المتخصصة",
			"files.workspace": "مجلد العمل",
			"module.delivery": "ضبط المشروع"
		});
		for (const [locale, messages] of Object.entries({
			zh: {
				"files.attachToChat": "注入对话",
				"preview.aiEdit": "AI 改",
				"preview.aiEditSelection": "AI 改选区",
				"files.attachedOne": "已注入对话：{name}",
				"files.attachedMany": "已注入对话 {n} 个文件",
				"files.pickerUnavailable": "无法打开系统文件选择框，请改用右侧资源文件的「注入对话」"
			},
			en: {
				"files.attachToChat": "Attach to chat",
				"preview.aiEdit": "Edit with AI",
				"preview.aiEditSelection": "Edit selection with AI",
				"files.attachedOne": "Attached to chat: {name}",
				"files.attachedMany": "Attached {n} files to chat",
				"files.pickerUnavailable": "The system file picker could not open. Use “Attach to chat” in the files panel on the right."
			},
			es: {
				"files.attachToChat": "Adjuntar al chat",
				"preview.aiEdit": "Editar con IA",
				"preview.aiEditSelection": "Editar selección con IA",
				"files.attachedOne": "Adjuntado al chat: {name}",
				"files.attachedMany": "Se adjuntaron {n} archivos al chat",
				"files.pickerUnavailable": "No se pudo abrir el selector de archivos del sistema. Usa «Adjuntar al chat» en el panel de archivos de la derecha."
			},
			fr: {
				"files.attachToChat": "Joindre au chat",
				"preview.aiEdit": "Modifier avec l’IA",
				"preview.aiEditSelection": "Modifier la sélection avec l’IA",
				"files.attachedOne": "Joint au chat : {name}",
				"files.attachedMany": "{n} fichiers joints au chat",
				"files.pickerUnavailable": "Le sélecteur de fichiers du système n’a pas pu s’ouvrir. Utilisez « Joindre au chat » dans le panneau des fichiers à droite."
			},
			de: {
				"files.attachToChat": "Im Chat anhängen",
				"preview.aiEdit": "Mit KI bearbeiten",
				"preview.aiEditSelection": "Auswahl mit KI bearbeiten",
				"files.attachedOne": "Im Chat angehängt: {name}",
				"files.attachedMany": "{n} Dateien im Chat angehängt",
				"files.pickerUnavailable": "Die Dateiauswahl des Systems konnte nicht geöffnet werden. Verwenden Sie „Im Chat anhängen“ in der Dateiansicht rechts."
			},
			ja: {
				"files.attachToChat": "チャットに添付",
				"preview.aiEdit": "AIで編集",
				"preview.aiEditSelection": "選択範囲をAIで編集",
				"files.attachedOne": "チャットに添付しました：{name}",
				"files.attachedMany": "{n}件のファイルをチャットに添付しました",
				"files.pickerUnavailable": "システムのファイル選択画面を開けませんでした。右側のファイルパネルの「チャットに添付」を使用してください。"
			},
			ko: {
				"files.attachToChat": "채팅에 첨부",
				"preview.aiEdit": "AI로 편집",
				"preview.aiEditSelection": "선택 영역을 AI로 편집",
				"files.attachedOne": "채팅에 첨부됨: {name}",
				"files.attachedMany": "파일 {n}개를 채팅에 첨부했습니다",
				"files.pickerUnavailable": "시스템 파일 선택 창을 열 수 없습니다. 오른쪽 파일 패널의 “채팅에 첨부”를 사용하세요."
			},
			pt: {
				"files.attachToChat": "Anexar ao chat",
				"preview.aiEdit": "Editar com IA",
				"preview.aiEditSelection": "Editar seleção com IA",
				"files.attachedOne": "Anexado ao chat: {name}",
				"files.attachedMany": "{n} arquivos anexados ao chat",
				"files.pickerUnavailable": "Não foi possível abrir o seletor de arquivos do sistema. Use “Anexar ao chat” no painel de arquivos à direita."
			},
			ru: {
				"files.attachToChat": "Прикрепить к чату",
				"preview.aiEdit": "Изменить с ИИ",
				"preview.aiEditSelection": "Изменить выделение с ИИ",
				"files.attachedOne": "Прикреплено к чату: {name}",
				"files.attachedMany": "К чату прикреплено файлов: {n}",
				"files.pickerUnavailable": "Не удалось открыть системное окно выбора файлов. Используйте «Прикрепить к чату» на панели файлов справа."
			},
			ar: {
				"files.attachToChat": "إرفاق بالمحادثة",
				"preview.aiEdit": "تحرير بالذكاء الاصطناعي",
				"preview.aiEditSelection": "تحرير التحديد بالذكاء الاصطناعي",
				"files.attachedOne": "تم الإرفاق بالمحادثة: {name}",
				"files.attachedMany": "تم إرفاق {n} ملفات بالمحادثة",
				"files.pickerUnavailable": "تعذر فتح نافذة اختيار ملفات النظام. استخدم «إرفاق بالمحادثة» في لوحة الملفات على اليمين."
			}
		})) Object.assign(AP_I18N[locale], messages);
		//#endregion
		//#region src/client/locales/workbench-chrome.js
		const en$1 = {
			"规划中": "Planning",
			"执行中": "In progress",
			"等待回推": "Waiting for agent update",
			"已阻塞": "Blocked",
			"已完成": "Completed",
			"失败": "Failed",
			"待处理": "Pending",
			"进行中": "In progress",
			"门禁未过": "Gate blocked",
			"Codex 执行": "Run with Codex",
			"当前会话已有附件发送事务，请等待完成后再切换 Codex 执行": "An attachment is still being sent in this conversation. Wait for it to finish before switching to Codex.",
			"正在用当前模型润色…": "Polishing with the current model…",
			"用当前模型润色提示词": "Polish prompt with the current model",
			"已用本地模板润色（当前模型未响应）": "Polished with a local template (model did not respond)",
			"已用当前模型润色": "Polished with the current model",
			"润色失败：": "Polishing failed: ",
			"下一条消息将由 Codex 子智能体执行": "Codex will handle the next message",
			"仅将下一条消息交给 Codex 子智能体": "Send only the next message to Codex",
			"加入文件夹失败：": "Could not add folder: ",
			"已加入对话的文件": "Files added to conversation",
			"移除": "Remove",
			"未回写": "No agent update",
			"已对齐": "Aligned",
			"缺执行账本": "Execution record missing",
			"存在差异": "Differences found",
			"心跳过期": "Agent update overdue",
			"等待人工": "Waiting for a person",
			"待核验": "Awaiting verification",
			"添加资料": "Add source files",
			"仅限用户明确登记的文件。企业工效表可一起登记，有则优先于网络调研。": "Only add files the customer has explicitly registered. Include company productivity data when available; use it before web research.",
			"取消": "Cancel",
			"保存登记": "Save registration",
			"从工作台移除项目「": "Remove project “",
			"」？磁盘上的项目文件会保留。": "” from the workbench? Project files on disk will remain.",
			"同一条推进口：未齐套先确认资料，否则恢复未完阶段。已写入的阶段稿不会再灌一遍。": "Continue the current workflow: confirm missing source files first, then resume the unfinished stage. Completed drafts will not be submitted twice.",
			"所有阶段均已完成；如需重跑，请对相应阶段「重置编排」。": "All stages are complete. To run one again, reset that stage’s plan.",
			"继续推进": "Continue",
			"移除项目": "Remove project",
			"用户要求（最高优先级）": "Customer requirements (highest priority)",
			"主会话的新要求与工作台共用这份账本；只改受影响成果，不再让旧软门禁触发整阶段返工。": "New requirements from the main conversation share this record. Revise only affected deliverables; older soft checks will not restart a whole stage.",
			" 条待落实": " requirements to address",
			"待落实": "To address",
			"已落实": "Addressed",
			"已采用为验收口径": "Accepted as review criteria",
			"落实说明：": "Implementation note: ",
			"影响成果：": "Affected deliverables: ",
			"标记已落实": "Mark addressed",
			"采用为验收口径": "Use as review criteria",
			"继续修改": "Continue editing",
			"不属于本项目": "Not applicable to this project",
			"流程监控": "Workflow monitor",
			"只有点「继续推进」才启动当前主会话事务；已启动事务会在应用重启后恢复，遇到人工决策门、阻塞或异常会停止。分析阶段只维护一套可追溯底稿。": "The current conversation workflow starts only when you select Continue. It resumes after an app restart and pauses for human decisions, blockers or errors. Analysis keeps one traceable working record.",
			"另一项目事务正在运行": "Another project workflow is running",
			"点继续推进后启动当前会话事务": "Select Continue to start this conversation workflow",
			"当前会话事务已暂停": "This conversation workflow is paused",
			"当前会话事务空闲": "This conversation workflow is idle",
			"检查于 ": "Checked at ",
			"对每个阶段做盘面对账：任务与产物、阶段总控、投标分析底稿、实际工程量清单、测算表、引用孤儿和人工门禁": "Compare each stage with its tasks, deliverables, summary, tender analysis, actual BOQ, calculation workbook, unresolved citations and human approval gates.",
			"体检中…": "Checking…",
			"检查": "Check",
			"解除缺件门槛：缺口保持为缺口，不授权联网尽调。": "Release the missing-source gate. Gaps remain recorded; this does not authorize web research.",
			"当前没有缺件门槛可放行": "There is no missing-source gate to release",
			"解除缺件门槛：缺口保持为缺口、继续使用已有资料，不授权联网尽调（联网需在对话中授权）。不会删除已完成批次。": "Release the missing-source gate and continue with available files? Gaps remain recorded. This does not authorize web research or remove completed batches.",
			"强制放行": "Release gate",
			"暂停当前会话事务，不中断当前对话": "Pause this workflow without interrupting the conversation",
			"暂停事务": "Pause workflow",
			"恢复事务": "Resume workflow",
			"执行态（主智能体回写）": "Execution state (agent update)",
			"主对话负责理解、计划、派活与阻塞说明": "The main conversation owns task understanding, planning, delegation and blocker explanations",
			"目标：": "Goal: ",
			"未登记": "Not recorded",
			"当前批次：": "Current batch: ",
			"下一动作：": "Next action: ",
			"尚未登记结构化计划。": "No structured plan has been recorded.",
			"子任务：": "Subtasks: ",
			"阻塞：": "Blocker: ",
			" · 心跳 ": " · Last agent update ",
			"主智能体尚未回写执行计划。点「继续推进」后，主对话应先读取 status，再登记目标、批次、计划和下一动作。": "The agent has not recorded an execution plan. After you select Continue, it should read the current status, then record the goal, batch, plan and next action.",
			"事实态（系统核验）": "Verified state (system checks)",
			"只核验磁盘成果、BOQ、证据、引用与人工门禁": "Checks actual files, BOQ, evidence, citations and human approval gates",
			"当前阶段：": "Current stage: ",
			"未开始": "Not started",
			"任务 ": "Tasks ",
			" · 总报告已就位": " · Summary report present",
			" · 缺《": " · Missing “",
			" · BOQ 已核验": " · BOQ verified",
			" · BOQ 有缺口": " · BOQ has gaps",
			" · 孤儿引用 ": " · Unresolved citations ",
			"尚未执行本轮事实核验；阶段状态为 ": "Current-state checks have not run yet; stage status: ",
			"事实版本 ": "Verified-state version ",
			"认知差异": "Differences between plan and results",
			"系统事实明细": "System check details",
			" · 最近产出 ": " · Last output ",
			" 分钟前": " minutes ago",
			"收起": "Collapse",
			"用户要求待落实 ": "Customer requirements to address: ",
			" 条": "",
			"用户验收口径已生效": "Customer review criteria applied",
			" 个 error）": " errors)",
			"缺产物 ": "Missing deliverables: ",
			" 份": "",
			"总报告已就位": "Summary report present",
			"缺《": "Missing “",
			"投标分析底稿已齐": "Tender analysis workpaper complete",
			"投标分析底稿未齐": "Tender analysis workpaper incomplete",
			"工程量清单已抽出 ": "BOQ rows extracted: ",
			" 行": "",
			"未摸到工程量清单": "BOQ not found",
			"测算表已就位": "Calculation workbook present",
			"引用 ": "Citations: ",
			" 令牌 / ": " tokens / ",
			" 孤儿": " unresolved",
			"门禁阻塞（": "Approval gate blocked (",
			" 缺口）": " gaps)",
			"门禁已放行": "Gate released",
			"阶段已收口（商务待办不挡完成）": "Stage closed (commercial follow-ups remain)",
			"无异常": "No issues",
			"阶段已收口。成果在 Agent Pi Outputs/": "Stage closed. Outputs: Agent Pi Outputs/",
			"/。询价、开工确认、submission_audit 未通过是投标可提交门禁，不表示本阶段没做完。": "/. Pending quotations, start confirmation or submission audit affect bid readiness, not stage completion.",
			"基线 v": "Baseline v",
			"记忆已失效": "Baseline out of date",
			"待生成记忆": "Baseline pending",
			"已强制放行": "Gate released",
			"用户已确认": "Customer confirmed",
			"用户已暂停": "Customer paused",
			"待用户决策": "Customer decision required",
			"前序基线：": "Upstream baseline: ",
			"能力包 ": "Capability package ",
			"缺口": "Gap",
			"清单 ": "Checklist ",
			" · 失败 ": " · Failed ",
			"待对齐": "Not aligned",
			"记录中…": "Recording…",
			"按知识库同一套逻辑把已登记 PDF / Word / Excel 对齐成 setup/ 解析稿": "Align registered PDF, Word and Excel files into setup/ manuscripts using the knowledge-base parser.",
			"对齐中…": "Aligning…",
			"对齐原稿": "Align source files",
			"资料已齐套": "Source files complete",
			"对齐并确认中…": "Aligning and confirming…",
			"资料齐套，进入下一阶段": "Sources complete; continue",
			"打开本阶段正式成果目录": "Open this stage’s official output folder",
			"打开成果": "Open outputs",
			"同步成果到正式输出，并核验全部引用令牌（孤儿引用逐条列出）": "Copy deliverables to official outputs and check every citation token; list unresolved citations individually.",
			"成果质检并整理": "Review and organize outputs",
			"再核一次盘面。已收口且无差异时不会要求再 complete_stage，也不会把商务待办写成阶段未完成。": "Check project state again. A closed, unchanged stage will not rerun complete_stage or treat commercial follow-ups as unfinished work.",
			"核对中…": "Checking…",
			"再次核对盘面": "Recheck project state",
			"跳到这一阶段。若它已是当前未完阶段，走恢复稿而不是再灌全文。": "Open this stage. If it is the current unfinished stage, resume its draft instead of loading the full source again.",
			"进入此阶段": "Open this stage",
			"重置「": "Reset “",
			"」编排？任务清单会清空，磁盘成果保留。": "” plan? The task list will be cleared; files on disk will remain.",
			"重置编排": "Reset plan",
			"项目资料": "Project source files",
			"对齐原稿后点名称预览改稿；保存同步 JSON": "Align source files, then select a name to review the manuscript; saving also updates JSON.",
			"尚未登记资料。": "No source files registered.",
			"知识面导航与证据": "Knowledge navigation and evidence",
			"PageIndex 影子树只负责长文档导航；BOQ 仍以表格单元格为准": "The PageIndex shadow tree navigates long documents. BOQ facts still come from spreadsheet cells.",
			"影子树 ": "Shadow trees: ",
			" 份保持原检索": " remain on original search",
			" 份已回退": " reverted",
			"默认导航": "Default navigation",
			"影子评测": "Shadow evaluation",
			"五域覆盖：已完成": "Five-area coverage: complete",
			"五域覆盖：有未读节点/证据/结论缺口": "Five-area coverage: unread nodes or evidence/conclusion gaps",
			"五域覆盖：等待首份长叙事资料对齐": "Five-area coverage: awaiting the first aligned long-form source",
			"结构化证据 ": "Structured evidence: ",
			"遥测 ": "Telemetry events: ",
			" 次": "",
			"默认切换仍受真实项目 80–120 项评测、Route F1、定位有效率、BOQ 基线和回退测试门禁控制。": "Default navigation remains gated by 80–120 real-project evaluations, Route F1, valid-locator rate, BOQ baseline and fallback tests.",
			"引用核验": "Citation checks",
			"成果中的 [kb:…]/[src:…]/[ev:…] 令牌逐一对回知识库、项目文件与冻结证据包": "Match every [kb:…]/[src:…]/[ev:…] token in outputs to a knowledge source, project file or frozen evidence pack.",
			"未通过：": "Failed: ",
			" 个孤儿引用 / 共 ": " unresolved citations / ",
			" 个令牌": " tokens",
			"通过：": "Passed: ",
			" 个令牌全部可解析（kb ": " tokens resolved (kb ",
			"尚无引用令牌（": "No citation tokens (",
			" 个成果文件）": " output files)",
			"…其余 ": "…remaining ",
			" 条见 orchestration/citation-audit.json": " listed in orchestration/citation-audit.json",
			"监控：": "Monitor: ",
			"阶段稿（最近一次准备的内容；提交后由 dsh 原生 subagent / workflow 执行）": "Stage draft (most recently prepared; native DSH subagents or workflows execute it after submission)",
			"正在用 MinerU 对齐原稿…": "Aligning source files with MinerU…",
			"正在按知识库逻辑对齐原稿…": "Aligning source files with the knowledge-base parser…",
			"已对齐 ": "Aligned ",
			" 份原稿": " source files",
			"；": "; ",
			" 份未对齐": " not aligned",
			"。点文件名可预览改稿，保存会同步 JSON。": ". Select a file to review its manuscript; saving also updates JSON.",
			"原稿对齐未完成：": "Source alignment incomplete: ",
			"没有需要对齐的原稿。": "No source files need alignment.",
			"项目资料登记": "Project setup",
			"招标文件解析": "Document analysis",
			"BOQ 逐页组价与资源汇总": "BOQ pricing and resource summary",
			"施工策划、进度、成本与出稿": "Construction planning, schedule, cost and deliverables",
			"实施工作区建立": "Delivery setup",
			"合同范围 / 进度 / 成本 / 风险": "Contract scope / schedule / cost / risk",
			"授权与工作区": "Mandate and workspace",
			"尽调与决策包": "Diligence and decision pack"
		};
		function localizeWorkbenchCopy(value, locale) {
			if (String(locale || "").toLowerCase().startsWith("zh")) return value;
			return en$1[value] ?? value;
		}
		//#endregion
		//#region src/client/locales/workbench-stages.js
		const stages = {
			"project-setup": ["项目资料登记", "Upload and register tender files. Align PDF, Word and Excel with the knowledge-base parser into reviewable manuscripts; saving also updates the sidecar JSON. Continue once the sources are complete."],
			"bid-risk-decision": ["投标决策与重大风险", "Prepare a bid/no-bid recommendation, critical risks, clarifications and decision conditions. The customer decides whether to continue."],
			"tender-document-analysis": ["招标文件解析", "Analyze every file into one traceable tender analysis workpaper and extract the actual BOQ in full. Create specialist views from the workpaper only when needed."],
			"pricing-basis-freeze": ["组价基准冻结", "Record currency, taxes, wages, materials, equipment, productivity, risk allowances and gaps as a traceable pricing basis. The customer confirms it before detailed pricing."],
			"boq-five-step-pricing": ["BOQ 逐页组价与资源汇总", "Price each BOQ section against this project’s conditions. Record gaps instead of inventing figures."],
			"planning-and-submission": ["施工与技术方案", "Use the confirmed basis and detailed pricing to prepare construction methods, schedule, resources, cash flow and technical response. This stage does not establish submission readiness."],
			"submission-compliance-freeze": ["合规检查与最终提交冻结", "Check eligibility, forms, signatures and seals, prices, technical proposal and submission media. Freeze the version only after customer approval."],
			"delivery-setup": ["实施工作区建立", "Confirm delivery inputs, data date, contract scope, control baselines and deliverables."],
			"delivery-controls": ["合同范围 / 进度 / 成本 / 风险", "Update contract scope, schedule, procurement, cost, cash flow, risks, changes and period-end reporting with the delivery skills."],
			"investment-setup": ["授权与工作区", "Confirm investment stage, mandate, valuation date, source files and decision thresholds."],
			"investment-diligence": ["尽调与决策包", "Prepare technical, market, legal and ESG diligence, valuation and the investment decision pack."]
		};
		const gateCopy = {
			"bid-risk-decision": {
				promptZh: ["请确认是否接受本轮投标建议并进入招标分析。", "Confirm whether to accept the bid recommendation and proceed to tender analysis."],
				approveLabelZh: ["确认投标，继续", "Confirm bid and continue"],
				rejectLabelZh: ["不投标，暂停", "Do not bid; pause"]
			},
			"pricing-basis-freeze": {
				promptZh: ["请确认组价基准和暂定假设，再进入详细 BOQ 组价。", "Confirm the pricing basis and provisional assumptions before detailed BOQ pricing."],
				approveLabelZh: ["确认基准，开始组价", "Confirm basis and price BOQ"]
			},
			"submission-compliance-freeze": {
				promptZh: ["请核对合规记录并确认是否冻结为最终提交版本。", "Review the compliance record and confirm the final submission version."],
				approveLabelZh: ["确认合规，冻结提交", "Confirm compliance and freeze"]
			}
		};
		function stageLabel(stage, locale) {
			if (!stage) return "";
			if (String(locale || "").startsWith("zh")) return stage.labelZh || stage.label || stage.id;
			const builtIn = stages[stage.id];
			return builtIn && stage.labelZh === builtIn[0] ? stage.label || stage.labelZh : stage.labelZh || stage.label || stage.id;
		}
		function stageHint(stage, locale) {
			if (!stage) return "";
			if (String(locale || "").startsWith("zh")) return stage.hintZh || stage.prompt || "";
			const builtIn = stages[stage.id];
			return builtIn && stage.labelZh === builtIn[0] ? builtIn[1] : stage.hintZh || stage.prompt || "";
		}
		function stageGate(stage, field, locale) {
			const value = stage?.approvalGate?.[field] || "";
			if (String(locale || "").startsWith("zh")) return value;
			const pair = gateCopy[stage?.id]?.[field];
			return pair && value === pair[0] && stage.labelZh === stages[stage.id]?.[0] ? pair[1] : value;
		}
		//#endregion
		//#region src/client/attachment-message-view.js
		const slot = "conversation.chat.node";
		/** Strip only product transport markers from a presentation copy, never the log. */
		function attachmentDisplayNode(node) {
			if (!Array.isArray(node?.data?.content)) return node;
			let changed = false;
			const content = node.data.content.map((block) => {
				if (block?.type !== "text" || typeof block.text !== "string") return block;
				const text = block.text.replace(/<!--agent-pi-attachment-tx:[^>]+?-->/g, "");
				if (text === block.text) return block;
				changed = true;
				return {
					...block,
					text: text.trimEnd()
				};
			});
			return changed ? {
				...node,
				data: {
					...node.data,
					content
				}
			} : node;
		}
		/** Keep the native bubble, attachments, references, copy action and localization. */
		function installAttachmentMessageView(ctx, React) {
			return ctx.slots.inject(slot, () => {
				const wrappers = /* @__PURE__ */ new Set();
				const installed = /* @__PURE__ */ new Map();
				let stopped = false;
				let scheduled = false;
				const refresh = () => {
					scheduled = false;
					if (stopped) return;
					for (const key of ["user", "steering"]) {
						const native = ctx.slots.entries(slot).find((entry) => entry.options.key === key && !wrappers.has(entry.component));
						const previous = installed.get(key);
						if (previous?.native === native) continue;
						installed.delete(key);
						previous?.dispose();
						if (!native) continue;
						const View = React.memo((props) => React.createElement(native.component, {
							...props,
							node: attachmentDisplayNode(props.node)
						}));
						wrappers.add(View);
						const dispose = ctx.slots.register({
							name: slot,
							key,
							priority: (native.options.priority ?? 0) - 1,
							...native.locale ? { locale: native.locale } : {},
							...native.inject ? { inject: native.inject } : {}
						}, View);
						installed.set(key, {
							native,
							dispose
						});
					}
				};
				const unsubscribe = ctx.slots.subscribe(slot, () => {
					if (stopped || scheduled) return;
					scheduled = true;
					queueMicrotask(refresh);
				});
				refresh();
				return () => {
					stopped = true;
					unsubscribe();
					for (const entry of installed.values()) entry.dispose();
					installed.clear();
				};
			});
		}
		//#endregion
		//#region src/client/archive-session-view.js
		/** Archived conversations use an independent native reference, never main selection. */
		function installArchiveSessionView(ctx, { React, useLanguage }) {
			const h = React.createElement;
			const slot = "agent-pi.archive.conversation";
			function FixedChat({ renderSlot }) {
				return renderSlot("conversation.session", { view: "chat" });
			}
			function Conversation({ renderFactorySlot }) {
				return renderFactorySlot("conversation.content", {
					variant: "embedded",
					phase: "active",
					hero: false
				}, { slots: { views: FixedChat } });
			}
			function ArchiveViewer(props) {
				const language = useLanguage();
				const t = (zh, en) => language === "zh" ? zh : en;
				const [id, setId] = React.useState("");
				const [reference, setReference] = React.useState(null);
				const [error, setError] = React.useState("");
				React.useEffect(() => {
					const open = (event) => setId(event.detail?.sessionId || "");
					window.addEventListener("agent-pi-view-archive", open);
					return () => window.removeEventListener("agent-pi-view-archive", open);
				}, []);
				React.useEffect(() => {
					if (!id) {
						setReference(null);
						return;
					}
					let active = true;
					const owned = props.sessions.retain(id, { source: "agentPiArchive" });
					setReference(owned);
					setError("");
					owned.ready.catch((reason) => {
						if (active) setError(String(reason?.message || reason));
					});
					return () => {
						active = false;
						owned.release();
					};
				}, [id, props.sessions]);
				if (!id) return null;
				return h("div", {
					className: "ap-overlay",
					style: { zIndex: 180 },
					role: "dialog",
					"aria-label": t("归档对话", "Archived conversation")
				}, h("div", { style: {
					background: "var(--dsw-alias-background-primary,white)",
					width: "min(1200px,94vw)",
					height: "90vh",
					display: "flex",
					flexDirection: "column",
					borderRadius: 16,
					padding: 16
				} }, h("button", {
					type: "button",
					onClick: () => setId(""),
					style: { alignSelf: "flex-end" }
				}, t("关闭归档对话", "Close archived conversation")), error && h("p", { role: "alert" }, error), reference?.sessionId === id && h("div", { style: {
					flex: 1,
					minHeight: 0,
					overflow: "auto"
				} }, h(props.SessionProvider, { session: reference }, props.renderSlot(slot, {})))));
			}
			ctx.inject(["sessions"], (scope) => {
				scope.slots.inject("shell.overlay", () => scope.slots.register({
					name: "shell.overlay",
					id: "agent-pi-archive-viewer",
					order: 30,
					children: { [slot]: {
						kind: "single",
						scope: "session"
					} }
				}, (props) => h(ArchiveViewer, {
					...props,
					sessions: scope.sessions
				})));
				scope.slots.inject(slot, () => scope.slots.register({ name: slot }, Conversation));
			});
		}
		//#endregion
		//#region src/client/agent-teams-settings.js
		function createAgentTeamsSettings(React) {
			const h = React.createElement;
			return function AgentTeamsSettings({ desktop, zh }) {
				const available = typeof desktop?.agentTeamsStatus === "function" && typeof desktop?.setAgentTeams === "function";
				const [enabled, setEnabled] = React.useState(false);
				const [busy, setBusy] = React.useState(available);
				const [message, setMessage] = React.useState("");
				React.useEffect(() => {
					if (!available) return;
					let disposed = false;
					desktop.agentTeamsStatus().then((value) => {
						if (!disposed) setEnabled(value.enabled === true);
					}).catch(() => {
						if (!disposed) setMessage(zh ? "无法读取团队协作设置。" : "Could not load the team setting.");
					}).finally(() => {
						if (!disposed) setBusy(false);
					});
					return () => {
						disposed = true;
					};
				}, [
					available,
					desktop,
					zh
				]);
				const toggle = async () => {
					setBusy(true);
					try {
						setEnabled((await desktop.setAgentTeams(!enabled)).enabled === true);
						setMessage(zh ? "已保存，重启应用后生效。" : "Saved. Restart the app to apply.");
					} catch {
						setMessage(zh ? "保存失败，请重试。" : "Could not save. Please retry.");
					} finally {
						setBusy(false);
					}
				};
				return h("div", {
					className: "ap-codex-card",
					style: { marginTop: 14 }
				}, h("div", { className: "ap-codex-status" }, h("strong", null, zh ? "Agent Teams · AI 智能体团队协作（实验）" : "Agent Teams · AI collaboration (experimental)"), h("button", {
					type: "button",
					role: "switch",
					className: "ap-switch" + (enabled ? " on" : ""),
					"aria-label": zh ? "Agent Teams 团队协作" : "Agent Teams",
					"aria-checked": enabled,
					disabled: busy || !available,
					onClick: toggle
				}, h("span", { className: "ap-switch-knob" }))), h("p", { className: "ap-sub" }, zh ? "由多个 AI 智能体分工完成任务，通过消息和共享任务板协作。默认关闭，开启并重启后，可在对话标题处查看团队成员和任务板。只有明确要求团队协作时才创建成员；成员共享工作目录。Codex 执行仍作为独立子智能体。" : "Multiple AI agents divide tasks and coordinate through messages and a shared task board. Off by default; enable and restart to show the roster and task board in the conversation header. Teammates are created only when explicitly requested and share the workspace. Codex execution remains a separate subagent."), !available && h("p", { className: "ap-sub" }, zh ? "此开关需要桌面应用。" : "This switch requires the desktop app."), message && h("p", {
					className: "ap-sub",
					role: "status"
				}, message));
			};
		}
		//#endregion
		//#region src/client/locales/search-settings.js
		const keys$2 = [
			"title",
			"lead",
			"applyKey",
			"key",
			"configured",
			"anonymous",
			"inactive",
			"storage",
			"save",
			"remove",
			"probe",
			"saved",
			"removed",
			"failed",
			"busy",
			"connected",
			"invalid-key",
			"access-denied",
			"quota-exhausted",
			"rate-limited",
			"unavailable",
			"plugin-inactive",
			"readOnly",
			"requestId"
		];
		const searchSettingsLocales = Object.fromEntries(Object.entries({
			zh: [
				"网络搜索 · AnySearch",
				"搜索、网页正文提取和专业领域检索共用 AnySearch。重要结论仍须核验原文、发布机构、属地和日期。",
				"申请 API Key",
				"AnySearch API Key",
				"已配置 API Key",
				"匿名访问 · 按 IP 限流及计量",
				"搜索插件尚未激活，请检查插件兼容状态。",
				"Key 保存到本机现有 DSH 凭据存储，不回显；保存后下一次请求即生效，无需重启。",
				"保存 Key",
				"移除已保存的 Key",
				"验证连接",
				"已保存，下一次请求生效。",
				"已移除本机保存的 Key。",
				"操作失败，请重试。",
				"正在处理…",
				"连接成功",
				"API Key 无效",
				"无访问权限或 Key 已过期",
				"额度已耗尽，请在官网管理额度",
				"请求频率过高，请稍后重试",
				"服务暂不可用，请检查网络后重试",
				"插件未激活",
				"当前凭据来源只读，请在对应环境中管理。",
				"请求编号"
			],
			en: [
				"Web search · AnySearch",
				"Search, page extraction and specialist searches share AnySearch. Verify important findings against the original source, publisher, jurisdiction and date.",
				"Get an API key",
				"AnySearch API key",
				"API key configured",
				"Anonymous access · Per-IP limits and quota",
				"The search plugin is inactive. Check plugin compatibility.",
				"Keys use the existing local DSH credential store and are never shown. Saved keys apply to the next request without restarting.",
				"Save key",
				"Remove saved key",
				"Test connection",
				"Saved. Applies to the next request.",
				"Locally saved key removed.",
				"Operation failed. Please retry.",
				"Working…",
				"Connected",
				"Invalid API key",
				"Access denied or key expired",
				"Quota exhausted. Manage quota on the official website.",
				"Rate limit reached. Retry later.",
				"Service unavailable. Check your connection and retry.",
				"Plugin inactive",
				"This credential source is read-only. Manage it in its source environment.",
				"Request ID"
			],
			es: [
				"Búsqueda web · AnySearch",
				"Las búsquedas, la extracción de páginas y las consultas especializadas usan AnySearch. Verifica los hallazgos importantes con la fuente original, el emisor, la jurisdicción y la fecha.",
				"Obtener clave API",
				"Clave API de AnySearch",
				"Clave API configurada",
				"Acceso anónimo · Límites y cuota por IP",
				"El complemento está inactivo. Revisa su compatibilidad.",
				"La clave se guarda en el almacén local de credenciales DSH y nunca se muestra. Se aplica en la siguiente solicitud sin reiniciar.",
				"Guardar clave",
				"Eliminar clave guardada",
				"Probar conexión",
				"Guardado. Se aplica en la siguiente solicitud.",
				"Clave local eliminada.",
				"La operación falló. Inténtalo de nuevo.",
				"Procesando…",
				"Conectado",
				"Clave API no válida",
				"Acceso denegado o clave caducada",
				"Cuota agotada. Adminístrala en el sitio oficial.",
				"Demasiadas solicitudes. Inténtalo más tarde.",
				"Servicio no disponible. Revisa la conexión.",
				"Complemento inactivo",
				"La fuente de credenciales es de solo lectura. Adminístrala en el entorno de origen.",
				"ID de solicitud"
			],
			fr: [
				"Recherche web · AnySearch",
				"La recherche, l’extraction de pages et les recherches spécialisées utilisent AnySearch. Vérifiez les conclusions importantes dans la source originale, avec l’émetteur, la juridiction et la date.",
				"Obtenir une clé API",
				"Clé API AnySearch",
				"Clé API configurée",
				"Accès anonyme · Limites et quota par IP",
				"Le module est inactif. Vérifiez sa compatibilité.",
				"La clé est conservée dans le stockage local de DSH et n’est jamais affichée. Elle s’applique à la requête suivante sans redémarrage.",
				"Enregistrer la clé",
				"Supprimer la clé enregistrée",
				"Tester la connexion",
				"Enregistrée. Effective à la requête suivante.",
				"Clé locale supprimée.",
				"Échec de l’opération. Réessayez.",
				"Traitement…",
				"Connexion réussie",
				"Clé API incorrecte",
				"Accès refusé ou clé expirée",
				"Quota épuisé. Gérez-le sur le site officiel.",
				"Trop de requêtes. Réessayez plus tard.",
				"Service indisponible. Vérifiez la connexion.",
				"Module inactif",
				"Cette source est en lecture seule. Gérez-la dans son environnement d’origine.",
				"Identifiant de requête"
			],
			de: [
				"Websuche · AnySearch",
				"Suche, Seitenextraktion und Fachrecherchen verwenden AnySearch. Prüfen Sie wichtige Ergebnisse anhand der Originalquelle, des Herausgebers, des Rechtsraums und des Datums.",
				"API-Schlüssel anfordern",
				"AnySearch API-Schlüssel",
				"API-Schlüssel eingerichtet",
				"Anonymer Zugriff · IP-Limits und Kontingent",
				"Das Suchplugin ist inaktiv. Prüfen Sie die Kompatibilität.",
				"Der Schlüssel wird im vorhandenen lokalen DSH-Speicher gespeichert und nie angezeigt. Er gilt ab der nächsten Anfrage ohne Neustart.",
				"Schlüssel speichern",
				"Gespeicherten Schlüssel entfernen",
				"Verbindung testen",
				"Gespeichert. Gilt ab der nächsten Anfrage.",
				"Lokal gespeicherter Schlüssel entfernt.",
				"Vorgang fehlgeschlagen. Bitte erneut versuchen.",
				"Wird verarbeitet…",
				"Verbunden",
				"Ungültiger API-Schlüssel",
				"Zugriff verweigert oder Schlüssel abgelaufen",
				"Kontingent verbraucht. Auf der offiziellen Website verwalten.",
				"Anfragelimit erreicht. Später erneut versuchen.",
				"Dienst nicht verfügbar. Verbindung prüfen.",
				"Plugin inaktiv",
				"Diese Quelle ist schreibgeschützt. Im ursprünglichen Umfeld verwalten.",
				"Anfrage-ID"
			],
			ja: [
				"ウェブ検索 · AnySearch",
				"検索、ページ本文の抽出、専門分野の検索は AnySearch を共用します。重要な結論は原文、発行者、適用地域、日付を確認してください。",
				"API キーを取得",
				"AnySearch API キー",
				"API キー設定済み",
				"匿名アクセス · IP ごとの制限と利用枠",
				"検索プラグインは無効です。互換性を確認してください。",
				"キーは既存のローカル DSH 資格情報ストアに保存され、再表示されません。次のリクエストから有効になり、再起動は不要です。",
				"キーを保存",
				"保存したキーを削除",
				"接続を確認",
				"保存しました。次のリクエストから有効です。",
				"ローカルに保存したキーを削除しました。",
				"操作に失敗しました。再試行してください。",
				"処理中…",
				"接続成功",
				"API キーが無効です",
				"アクセス拒否またはキーの期限切れ",
				"利用枠を使い切りました。公式サイトで管理してください。",
				"リクエストが多すぎます。後で再試行してください。",
				"サービスを利用できません。接続を確認してください。",
				"プラグイン無効",
				"この資格情報のソースは読み取り専用です。元の環境で管理してください。",
				"リクエスト ID"
			],
			ko: [
				"웹 검색 · AnySearch",
				"검색, 페이지 본문 추출 및 전문 검색은 AnySearch를 공유합니다. 중요한 결과는 원문, 발행 기관, 관할 지역과 날짜를 확인하세요.",
				"API 키 발급",
				"AnySearch API 키",
				"API 키 설정됨",
				"익명 접속 · IP별 제한 및 할당량",
				"검색 플러그인이 비활성 상태입니다. 호환성을 확인하세요.",
				"키는 기존 로컬 DSH 자격 증명 저장소에 저장되며 다시 표시되지 않습니다. 재시작 없이 다음 요청부터 적용됩니다.",
				"키 저장",
				"저장된 키 삭제",
				"연결 확인",
				"저장되었습니다. 다음 요청부터 적용됩니다.",
				"로컬에 저장된 키를 삭제했습니다.",
				"작업에 실패했습니다. 다시 시도하세요.",
				"처리 중…",
				"연결됨",
				"유효하지 않은 API 키",
				"접근 거부 또는 키 만료",
				"할당량 소진. 공식 사이트에서 관리하세요.",
				"요청 한도 초과. 나중에 다시 시도하세요.",
				"서비스를 사용할 수 없습니다. 연결을 확인하세요.",
				"플러그인 비활성",
				"이 자격 증명 소스는 읽기 전용입니다. 원본 환경에서 관리하세요.",
				"요청 ID"
			],
			pt: [
				"Pesquisa web · AnySearch",
				"Pesquisa, extração de páginas e consultas especializadas usam AnySearch. Verifique conclusões importantes na fonte original, com o emissor, a jurisdição e a data.",
				"Obter chave API",
				"Chave API AnySearch",
				"Chave API configurada",
				"Acesso anónimo · Limites e quota por IP",
				"O plugin está inativo. Verifique a compatibilidade.",
				"A chave usa o armazenamento local de credenciais DSH e nunca é exibida. Aplica-se ao próximo pedido sem reiniciar.",
				"Guardar chave",
				"Remover chave guardada",
				"Testar ligação",
				"Guardada. Aplica-se ao próximo pedido.",
				"Chave local removida.",
				"A operação falhou. Tente novamente.",
				"A processar…",
				"Ligação estabelecida",
				"Chave API inválida",
				"Acesso negado ou chave expirada",
				"Quota esgotada. Faça a gestão no site oficial.",
				"Limite de pedidos atingido. Tente mais tarde.",
				"Serviço indisponível. Verifique a ligação.",
				"Plugin inativo",
				"Esta fonte é só de leitura. Faça a gestão no ambiente de origem.",
				"ID do pedido"
			],
			ru: [
				"Поиск в интернете · AnySearch",
				"Поиск, извлечение страниц и специализированные запросы используют AnySearch. Проверяйте важные выводы по первоисточнику, издателю, юрисдикции и дате.",
				"Получить ключ API",
				"Ключ API AnySearch",
				"Ключ API настроен",
				"Анонимный доступ · Лимиты и квота по IP",
				"Плагин поиска не активен. Проверьте совместимость.",
				"Ключ сохраняется в локальном хранилище DSH и не отображается повторно. Он применяется со следующего запроса без перезапуска.",
				"Сохранить ключ",
				"Удалить сохранённый ключ",
				"Проверить соединение",
				"Сохранено. Применяется со следующего запроса.",
				"Локально сохранённый ключ удалён.",
				"Операция не выполнена. Повторите попытку.",
				"Обработка…",
				"Соединение установлено",
				"Неверный ключ API",
				"Доступ запрещён или срок ключа истёк",
				"Квота исчерпана. Управляйте ей на официальном сайте.",
				"Слишком много запросов. Повторите позже.",
				"Сервис недоступен. Проверьте соединение.",
				"Плагин не активен",
				"Источник доступен только для чтения. Управляйте им в исходной среде.",
				"ID запроса"
			],
			ar: [
				"البحث على الويب · AnySearch",
				"يستخدم البحث واستخراج محتوى الصفحات والبحث المتخصص خدمة AnySearch. تحقق من النتائج المهمة بالرجوع إلى المصدر الأصلي والجهة الناشرة والاختصاص والتاريخ.",
				"الحصول على مفتاح API",
				"مفتاح AnySearch API",
				"تم إعداد مفتاح API",
				"وصول مجهول · حدود وحصة لكل عنوان IP",
				"إضافة البحث غير مفعلة. تحقق من التوافق.",
				"يُحفظ المفتاح في مخزن بيانات اعتماد DSH المحلي ولا يُعرض مجدداً. يسري من الطلب التالي دون إعادة تشغيل.",
				"حفظ المفتاح",
				"إزالة المفتاح المحفوظ",
				"اختبار الاتصال",
				"تم الحفظ. يسري من الطلب التالي.",
				"تمت إزالة المفتاح المحفوظ محلياً.",
				"فشلت العملية. حاول مجدداً.",
				"جارٍ المعالجة…",
				"تم الاتصال",
				"مفتاح API غير صالح",
				"رُفض الوصول أو انتهت صلاحية المفتاح",
				"نفدت الحصة. أدرها على الموقع الرسمي.",
				"تم تجاوز معدل الطلبات. حاول لاحقاً.",
				"الخدمة غير متاحة. تحقق من الاتصال.",
				"الإضافة غير مفعلة",
				"مصدر بيانات الاعتماد للقراءة فقط. أدره في بيئته الأصلية.",
				"معرّف الطلب"
			]
		}).map(([locale, values]) => [locale, Object.fromEntries(keys$2.map((key, index) => [key, values[index]]))]));
		function searchSettingsText(locale, key) {
			return (searchSettingsLocales[String(locale || "").toLowerCase().split("-")[0]] || searchSettingsLocales.en)[key] || searchSettingsLocales.en[key] || key;
		}
		//#endregion
		//#region src/client/search-settings.js
		const ANYSEARCH_KEY_CONSOLE = "https://anysearch.com/console/api-keys";
		/** Operations use the native write-only credential Remote; no key read method exists here. */
		function createSearchSettingsOperations(remote, api) {
			const unwrap = (result) => {
				if (!result?.ok) throw new Error("Credential operation failed");
				return result.value;
			};
			return {
				view: () => api("/api/agent-pi/search-settings"),
				describe: async (ref) => unwrap(await remote.credentials.describe([ref]))[ref],
				save: async (ref, key) => {
					unwrap(await remote.credentials.set(ref, key.trim()));
				},
				remove: async (ref) => {
					unwrap(await remote.credentials.unset(ref));
				},
				probe: () => api("/api/agent-pi/search-settings", "", { method: "POST" })
			};
		}
		function createSearchSettings(React) {
			const h = React.createElement;
			return function SearchSettings({ operations, locale = "en" }) {
				const [view, setView] = React.useState(null);
				const [info, setInfo] = React.useState(null);
				const [key, setKey] = React.useState("");
				const [busy, setBusy] = React.useState(true);
				const [message, setMessage] = React.useState("");
				const [requestId, setRequestId] = React.useState("");
				const t = (value) => searchSettingsText(locale, value);
				React.useEffect(() => {
					let disposed = false;
					setBusy(true);
					setKey("");
					operations.view().then(async (current) => {
						const credential = current.active ? await operations.describe(current.apiKeyRef) : null;
						if (!disposed) {
							setView(current);
							setInfo(credential);
						}
					}).catch(() => {
						if (!disposed) setMessage("failed");
					}).finally(() => {
						if (!disposed) setBusy(false);
					});
					return () => {
						disposed = true;
					};
				}, [operations]);
				const act = async (kind) => {
					if (busy) return;
					setBusy(true);
					setMessage("");
					setRequestId("");
					try {
						if (kind === "probe") {
							const result = await operations.probe();
							setMessage(result.state);
							if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.requestId || "")) setRequestId(result.requestId);
						} else {
							if (kind === "save") await operations.save(view.apiKeyRef, key);
							else await operations.remove(view.apiKeyRef);
							setKey("");
							setMessage(kind === "save" ? "saved" : "removed");
							setInfo(await operations.describe(view.apiKeyRef));
						}
					} catch {
						setMessage("failed");
					} finally {
						setBusy(false);
					}
				};
				const writable = view?.active && info?.writable === true;
				return h("section", {
					className: "ap-codex-settings",
					dir: String(locale).startsWith("ar") ? "rtl" : void 0
				}, h("h2", null, t("title")), h("p", { className: "ap-codex-lead" }, t("lead")), h("div", { className: "ap-codex-card" }, h("p", { role: "status" }, view?.active ? t(info?.configured ? "configured" : "anonymous") : t("inactive")), h("a", {
					href: ANYSEARCH_KEY_CONSOLE,
					target: "_blank",
					rel: "noopener noreferrer"
				}, t("applyKey")), h("p", { className: "ap-sub" }, t("storage")), h("label", { htmlFor: "ap-anysearch-key" }, t("key")), h("input", {
					id: "ap-anysearch-key",
					type: "password",
					autoComplete: "new-password",
					value: key,
					disabled: busy || !writable,
					onChange: (event) => setKey(event.target.value),
					style: {
						display: "block",
						width: "100%",
						margin: "8px 0"
					}
				}), view?.active && info && !info.writable ? h("p", { className: "ap-sub" }, t("readOnly")) : null, h("button", {
					type: "button",
					disabled: busy || !writable || !key.trim(),
					onClick: () => act("save")
				}, t("save")), h("button", {
					type: "button",
					disabled: busy || !writable || !info?.configured,
					onClick: () => act("remove"),
					style: { marginInlineStart: 8 }
				}, t("remove")), h("button", {
					type: "button",
					disabled: busy || !view?.active,
					onClick: () => act("probe"),
					style: { marginInlineStart: 8 }
				}, t("probe")), h("p", {
					role: "status",
					"aria-live": "polite",
					className: "ap-sub"
				}, busy ? t("busy") : message ? t(message) : ""), requestId ? h("p", { className: "ap-sub" }, t("requestId"), ": ", h("code", null, requestId)) : null));
			};
		}
		//#endregion
		//#region src/client/api-client.js
		function appendWorkspaceQuery(path, cwd) {
			return `${path}${String(path).includes("?") ? "&" : "?"}cwd=${encodeURIComponent(cwd || "")}`;
		}
		function createAgentPiApiClient(options = {}) {
			const fetchImpl = options.fetchImpl || ((...args) => fetch(...args));
			const setTimer = options.setTimer || ((callback, delay) => setTimeout(callback, delay));
			const clearTimer = options.clearTimer || ((timer) => clearTimeout(timer));
			const documentRef = options.documentRef || (typeof document !== "undefined" ? document : null);
			const urlApi = options.urlApi || (typeof URL !== "undefined" ? URL : null);
			function api(path, cwd, init) {
				const opts = init || {};
				const timeoutMs = opts.timeoutMs;
				const rest = Object.assign({}, opts);
				delete rest.timeoutMs;
				const ctrl = rest.signal ? null : new AbortController();
				const timer = timeoutMs ? setTimer(() => {
					if (ctrl) ctrl.abort();
				}, timeoutMs) : null;
				return fetchImpl(appendWorkspaceQuery(path, cwd), Object.assign({ headers: { "content-type": "application/json" } }, rest, { signal: rest.signal || ctrl && ctrl.signal })).then(async (res) => {
					const body = await res.json().catch(() => ({}));
					if (!res.ok) throw new Error(body.error || res.statusText);
					return body;
				}).catch((err) => {
					if (err && (err.name === "AbortError" || /aborted/i.test(String(err.message || err)))) throw new Error(timeoutMs ? "打开文件超时，请改用资源管理器或稍后再试。" : "请求已取消");
					throw err;
				}).finally(() => {
					if (timer) clearTimer(timer);
				});
			}
			function apiBlob(path, cwd, init) {
				return fetchImpl(appendWorkspaceQuery(path, cwd), {
					headers: { "content-type": "application/json" },
					...init
				}).then(async (res) => {
					if (!res.ok) {
						const body = await res.json().catch(() => ({}));
						throw new Error(body.error || res.statusText);
					}
					const blob = await res.blob();
					const disposition = res.headers.get("content-disposition") || "";
					const match = /filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i.exec(disposition);
					return {
						blob,
						filename: decodeURIComponent(match && (match[1] || match[2]) || "download")
					};
				});
			}
			function downloadBlob(blob, filename) {
				if (!documentRef || !urlApi) throw new Error("Download is unavailable outside the desktop renderer.");
				const url = urlApi.createObjectURL(blob);
				const anchor = documentRef.createElement("a");
				anchor.href = url;
				anchor.download = filename;
				documentRef.body.appendChild(anchor);
				anchor.click();
				anchor.remove();
				setTimer(() => urlApi.revokeObjectURL(url), 1500);
			}
			function rawFileUrl(cwd, filePath) {
				return `/api/agent-pi/files/raw?cwd=${encodeURIComponent(cwd || "")}&path=${encodeURIComponent(filePath || "")}`;
			}
			return {
				api,
				apiBlob,
				downloadBlob,
				rawFileUrl
			};
		}
		//#endregion
		//#region src/client/univer-viewer-url.js
		function scopeUniverViewerUrl(viewerUrl, sessionId) {
			if (!viewerUrl.startsWith("/univer-viewer/")) return viewerUrl;
			if (!sessionId) return "";
			const url = new URL(viewerUrl, "http://localhost");
			url.searchParams.set("sessionId", sessionId);
			return url.pathname + url.search + url.hash;
		}
		//#endregion
		//#region src/client/project-plan-model.js
		const DAY = 864e5;
		function planTime(value) {
			const parts = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value || "");
			return parts ? Date.UTC(+parts[1], +parts[2] - 1, +parts[3], +(parts[4] || 0), +(parts[5] || 0), +(parts[6] || 0)) : NaN;
		}
		function taskRows(tasks, edits = {}) {
			const stack = [];
			return tasks.map((task, index) => {
				const level = Math.max(0, Number(task.level) || 0);
				while (stack.length && stack.at(-1).level >= level) stack.pop();
				const row = {
					...task,
					...edits[task.uid],
					key: task.uid == null ? `row:${index}` : `uid:${task.uid}`,
					sourceIndex: index,
					level,
					parents: stack.map((parent) => parent.key),
					hasChildren: index + 1 < tasks.length && (Number(tasks[index + 1].level) || 0) > level
				};
				stack.push(row);
				return row;
			});
		}
		function visibleTaskRows(rows, { collapsed = /* @__PURE__ */ new Set(), query = "", filter = "all" } = {}) {
			const text = query.trim().toLocaleLowerCase();
			if (!text && filter === "all") return rows.filter((row) => !row.parents.some((key) => collapsed.has(key)));
			const keep = /* @__PURE__ */ new Set();
			for (const row of rows) if ((!text || [
				row.name,
				row.wbs,
				row.activityId,
				row.id
			].join(" ").toLocaleLowerCase().includes(text)) && (filter === "all" || filter === "critical" && row.critical || filter === "milestone" && row.milestone || filter === "incomplete" && !row.summary && Number(row.percent || 0) < 100)) {
				keep.add(row.key);
				row.parents.forEach((key) => keep.add(key));
			}
			return rows.filter((row) => keep.has(row.key));
		}
		function timelineRange(rows, scale, viewport = 700) {
			let start = Infinity, finish = -Infinity;
			for (const row of rows) {
				const a = planTime(row.start), b = planTime(row.finish);
				if (Number.isFinite(a)) {
					start = Math.min(start, a);
					finish = Math.max(finish, a);
				}
				if (Number.isFinite(b)) {
					start = Math.min(start, b);
					finish = Math.max(finish, b);
				}
			}
			if (!Number.isFinite(start)) return null;
			start = Math.floor(start / DAY) * DAY - 2 * DAY;
			finish = Math.ceil(finish / DAY) * DAY + 3 * DAY;
			const span = Math.max(7 * DAY, finish - start);
			const pixelsPerDay = scale === "day" ? 36 : scale === "month" ? 4 : scale === "fit" ? Math.max(.02, (viewport - 24) / (span / DAY)) : 12;
			return {
				start,
				finish: start + span,
				pixelsPerDay,
				width: Math.max(viewport, Math.ceil(span / DAY * pixelsPerDay)),
				x: (time) => (time - start) / DAY * pixelsPerDay
			};
		}
		function timelineTicks(range, scale) {
			if (!range) return {
				months: [],
				units: []
			};
			const months = [], units = [];
			const date = new Date(range.start);
			let month = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
			while (month < range.finish) {
				const d = new Date(month), next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
				months.push({
					start: Math.max(range.start, month),
					end: Math.min(range.finish, next),
					date: month
				});
				month = next;
			}
			const step = scale === "day" ? 1 : Math.max(7, Math.ceil(50 / (range.pixelsPerDay * 7)) * 7);
			let unit = range.start;
			if (step % 7 === 0) unit -= (new Date(unit).getUTCDay() + 6) % 7 * DAY;
			while (unit < range.finish && units.length < 2e3) {
				units.push({
					start: Math.max(range.start, unit),
					end: Math.min(range.finish, unit + step * DAY),
					date: unit
				});
				unit += step * DAY;
			}
			return {
				months,
				units
			};
		}
		function taskGeometry(row, range) {
			if (!range) return null;
			const start = planTime(row.start), finish = planTime(row.finish);
			if (!Number.isFinite(start) || !Number.isFinite(finish) || finish < start) return null;
			const left = range.x(start), right = range.x(finish);
			return {
				left,
				right,
				width: Math.max(row.milestone ? 0 : 3, right - left)
			};
		}
		function relationCode(type) {
			const normalized = String(type || "").toUpperCase().replaceAll("_", " ");
			return {
				"FINISH-START": "FS",
				"FINISH-FINISH": "FF",
				"START-START": "SS",
				"START-FINISH": "SF",
				"FINISH TO START": "FS",
				"FINISH TO FINISH": "FF",
				"START TO START": "SS",
				"START TO FINISH": "SF"
			}[normalized] || ([
				"FS",
				"FF",
				"SS",
				"SF"
			].includes(normalized) ? normalized : null);
		}
		function dependencyPaths(rows, range, from, to) {
			const byUid = new Map(rows.map((row, index) => [String(row.uid), {
				row,
				index
			}]).filter(([, value]) => value.row.uid != null));
			const links = [];
			rows.forEach((row, index) => {
				const target = taskGeometry(row, range);
				if (!target) return;
				for (const link of row.predecessors || []) {
					const source = byUid.get(String(link.uid)), type = relationCode(link.type);
					if (!source || !type || index < from && source.index < from || index >= to && source.index >= to) continue;
					const origin = taskGeometry(source.row, range);
					if (!origin) continue;
					const x1 = type[0] === "F" ? origin.right : origin.left, x2 = type[1] === "F" ? target.right : target.left;
					const y1 = source.index * 28 + 28 / 2, y2 = index * 28 + 28 / 2;
					const out = x1 + (type[0] === "F" ? 8 : -8), into = x2 + (type[1] === "F" ? 8 : -8);
					const middle = y2 + (y1 > y2 ? 28 / 2 - 3 : -11);
					links.push({
						key: `${row.key}:${source.row.key}:${links.length}`,
						targetKey: row.key,
						sourceKey: source.row.key,
						type,
						path: `M${x1},${y1} H${out} V${middle} H${into} V${y2} H${x2}`
					});
				}
			});
			return links;
		}
		function virtualWindow(count, scrollTop, height) {
			const from = Math.max(0, Math.floor(scrollTop / 28) - 8);
			return {
				from,
				to: Math.min(count, from + Math.ceil(height / 28) + 16)
			};
		}
		//#endregion
		//#region src/client/project-plan-styles.js
		const projectPlanCss = `
.ap-doc-scroll.plan{padding:0;overflow:hidden;background:#fff;display:flex;flex-direction:column}
.ap-plan{--plan-bg:#fff;--plan-text:#202a34;--plan-muted:#697685;--plan-border:#d9dee4;--plan-header:#59636c;--plan-selected:#e2f0fc;--plan-accent:#167647;display:flex;flex-direction:column;flex:1;min-height:0;height:100%;color:var(--plan-text);background:var(--plan-bg);font:13px/1.4 'Segoe UI','Microsoft YaHei',sans-serif}
.ap-plan *{box-sizing:border-box}
.ap-plan button,.ap-plan input,.ap-plan select,.ap-plan textarea{font:12px/1.4 'Segoe UI','Microsoft YaHei',sans-serif;color:var(--plan-text)}
.ap-plan button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:30px;border:1px solid transparent;border-radius:3px;background:transparent;padding:4px 8px;cursor:pointer;white-space:nowrap}
.ap-plan button:hover:not(:disabled){background:var(--plan-selected);border-color:var(--plan-border)}
.ap-plan button:disabled{opacity:.4;cursor:default}
.ap-plan button:focus-visible,.ap-plan input:focus,.ap-plan select:focus,.ap-plan textarea:focus{outline:2px solid #3991d4;outline-offset:-1px}
.ap-plan input,.ap-plan select,.ap-plan textarea{border:1px solid var(--plan-border);border-radius:3px;background:var(--plan-bg);min-height:30px;padding:4px 7px;min-width:0}
.ap-plan button.primary{background:var(--plan-accent);color:white;border-color:var(--plan-accent)}
.ap-plan-toolbar{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--plan-border);flex-wrap:wrap}
.ap-plan-toolbar strong{font-size:18px;font-weight:600;color:var(--plan-accent);margin-inline-end:6px;white-space:nowrap}
.ap-plan-project{max-width:320px;width:230px}
.ap-plan-search{width:180px}
.ap-plan-mobile-view{display:none}
.ap-plan-tools{display:flex;align-items:center;gap:3px;flex-wrap:wrap}
.ap-plan-tools label{display:flex;align-items:center;gap:5px;font-size:12px;white-space:nowrap}
.ap-plan-tools input[type=checkbox]{min-height:0;width:13px;height:13px;accent-color:var(--plan-accent)}
.ap-plan-tools select{max-width:112px}
.ap-plan-export{display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--plan-border);background:#f4f7f8;flex-wrap:wrap}
.ap-plan-export label{display:flex;gap:6px;align-items:center}
.ap-plan-export input{width:270px;max-width:100%}
.ap-plan-split{display:grid;grid-template-columns:minmax(0,var(--ap-plan-table,52%)) 7px minmax(0,1fr);flex:1;min-height:160px;direction:ltr;overflow:hidden}
.ap-plan-pane{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
.ap-plan-divider{background:#edf0f3;border-inline:1px solid var(--plan-border);cursor:col-resize;touch-action:none}
.ap-plan-divider:hover,.ap-plan-divider:focus-visible{background:#91b9cc}
.ap-plan-header{height:52px;flex:0 0 52px;overflow:hidden;background:var(--plan-header);color:#fff;border-bottom:1px solid var(--plan-border)}
.ap-plan-grid-head,.ap-plan-task-row{display:grid;grid-template-columns:44px 95px 320px 86px 112px 112px 70px 160px}
.ap-plan-grid-head{height:52px;width:1099px;align-items:end;will-change:transform}
.ap-plan-grid-head>div{padding:8px;border-inline-end:1px solid #74808b;height:32px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ap-plan-scroll{flex:1;min-height:0;overflow:scroll;scrollbar-width:thin;overscroll-behavior:contain}
.ap-plan-grid-content{position:relative;width:1099px;min-height:100%}
.ap-plan-task-row{position:absolute;left:0;width:1099px;height:28px;align-items:center;border-bottom:1px solid var(--plan-border);background:var(--plan-bg);cursor:default;outline:none}
.ap-plan-task-row:nth-child(even){background:color-mix(in srgb,var(--plan-bg) 97%,#637b90)}
.ap-plan-task-row.selected{background:var(--plan-selected)}
.ap-plan-task-row:focus-visible{box-shadow:inset 0 0 0 2px #3991d4}
.ap-plan-task-row.summary{font-weight:650}
.ap-plan-cell{height:28px;display:flex;align-items:center;gap:4px;border-inline-end:1px solid var(--plan-border);padding:0 8px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.ap-plan-cell.row-number{color:var(--plan-muted);justify-content:center;padding:0 3px;background:color-mix(in srgb,var(--plan-bg) 93%,#637b90);font-size:11px}
.ap-plan-cell.task-name{padding-inline-start:6px}
.ap-plan-cell.task-name span{overflow:hidden;text-overflow:ellipsis}
.ap-plan-cell.task-name button{min-height:20px;min-width:20px;width:20px;padding:1px;border:0;flex:none}
.ap-plan-cell.task-name input{width:100%;height:24px;min-height:24px;padding:2px 4px;font-weight:400}
.ap-plan-caret-space{width:20px;flex:none}
.ap-plan-modified{color:#bd7218;flex:none;font-size:15px}
.ap-plan-ruler{position:relative;height:52px;will-change:transform}
.ap-plan-ruler-cell{position:absolute;padding:3px 6px;white-space:nowrap;overflow:hidden;border-inline-end:1px solid #74808b;height:26px;font-size:11px}
.ap-plan-ruler-cell.unit{top:26px;border-top:1px solid #74808b}
.ap-plan-chart-content{position:relative;min-height:100%;background:var(--plan-bg);isolation:isolate}
.ap-plan-chart-row{position:absolute;left:0;right:0;height:28px;border-bottom:1px solid var(--plan-border);z-index:0;cursor:pointer}
.ap-plan-chart-row.selected{background:var(--plan-selected)}
.ap-plan-chart-grid{position:absolute;inset:0;pointer-events:none;z-index:1}
.ap-plan-tick{position:absolute;top:0;bottom:0;border-inline-start:1px solid #e2e7ec}
.ap-plan-bar{position:absolute;height:12px;top:8px;background:#87bceb;border:1px solid #368cd3;border-radius:1px;z-index:3;min-height:0!important;padding:0!important;overflow:visible}
.ap-plan-bar:hover:not(:disabled){background:#70aedd!important;border-color:#368cd3!important}
.ap-plan-bar.critical{background:#f9aaaa;border-color:#d45e5e}
.ap-plan-bar.critical:hover:not(:disabled){background:#f19a9a!important;border-color:#d45e5e!important}
.ap-plan-progress{height:100%;background:#2a7fc6;display:block}
.ap-plan-bar.critical .ap-plan-progress{background:#c94343}
.ap-plan-bar.summary{height:6px;top:9px;background:#39444f;border:0;border-radius:0;overflow:visible}
.ap-plan-bar.summary:before,.ap-plan-bar.summary:after{content:'';position:absolute;top:0;border-top:11px solid #39444f;border-right:6px solid transparent}
.ap-plan-bar.summary:before{left:0}.ap-plan-bar.summary:after{right:0;transform:scaleX(-1)}
.ap-plan-bar.milestone{width:10px!important;height:10px;top:9px;transform:translateX(-5px) rotate(45deg);background:#287fbd;border-color:#287fbd;border-radius:0}
.ap-plan-bar.milestone.critical{background:#cf5555;border-color:#cf5555}
.ap-plan-bar.selected{box-shadow:0 0 0 2px var(--plan-bg),0 0 0 3px #1573ad}
.ap-plan-links{position:absolute;left:0;top:0;pointer-events:none;z-index:2;overflow:hidden}
.ap-plan-today{position:absolute;top:0;bottom:0;border-left:1px dashed #328653;z-index:4;pointer-events:none}
.ap-plan-today span{position:sticky;top:0;display:inline-block;background:#328653;color:white;padding:1px 4px;white-space:nowrap;font-size:10px}
.ap-plan-inspector{display:grid;grid-template-columns:minmax(0,2fr) minmax(150px,1fr) minmax(160px,1fr);gap:12px;padding:10px 14px;border-top:1px solid var(--plan-border);max-height:220px;overflow:auto;flex-shrink:0}
.ap-plan-detail-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.ap-plan-detail-fields .name{grid-column:1/-1}
.ap-plan-inspector label{display:flex;flex-direction:column;gap:4px;min-width:0;font-size:11px;color:var(--plan-muted)}
.ap-plan-inspector input,.ap-plan-inspector textarea{width:100%;font-size:12px;color:var(--plan-text)}
.ap-plan-inspector textarea{height:90px;resize:vertical}
.ap-plan-detail-read{display:flex;flex-direction:column;gap:8px;border-inline-start:1px solid var(--plan-border);padding-inline-start:12px;font-size:11px}
.ap-plan-detail-read div{overflow-wrap:anywhere}
.ap-plan-detail-read span{display:block;color:var(--plan-muted);margin-bottom:3px}
.ap-plan-detail-read button{font-size:11px;color:#247eaf;min-height:22px;padding:0 4px}
.ap-plan-footer{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:6px 14px;border-top:1px solid var(--plan-border);color:var(--plan-muted);font-size:11px;flex-shrink:0}
.ap-plan-legend{display:flex;align-items:center;gap:10px;margin-inline-start:auto}
.ap-plan-legend i{display:inline-block;width:10px;height:7px;background:#87bceb;margin-inline-end:4px;border:1px solid #368cd3}
.ap-plan-legend i.critical{background:#f9aaaa;border-color:#d45e5e}
.ap-plan-legend i.milestone{height:7px;width:7px;transform:rotate(45deg);background:#287fbd}
.ap-plan-message{padding:8px 14px;border-bottom:1px solid var(--plan-border);font-size:12px;flex-shrink:0;overflow-wrap:anywhere;max-height:80px;overflow:auto}
.ap-plan-message.error{color:#b92e2e;background:#fff4f4}
.ap-plan-message.success{color:#247348;background:#f0faf4}
.ap-plan-empty{padding:30px;color:var(--plan-muted);text-align:center}
.ap-plan-help{padding:6px 14px;border-top:1px solid var(--plan-border);font-size:11px;color:var(--plan-muted)}
.ap-plan-help summary{cursor:pointer}
body[data-ds-dark-theme] .ap-plan{--plan-bg:#1e252c;--plan-text:#e1e8ee;--plan-muted:#a4b2be;--plan-border:#394550;--plan-header:#35424f;--plan-selected:#243e54;--plan-accent:#4db27b}
body[data-ds-dark-theme] .ap-plan-export{background:#232e37}
body[data-ds-dark-theme] .ap-plan-tick{border-color:#35414c}
@media(max-width:850px){.ap-plan-toolbar{gap:6px;padding:8px}.ap-plan-toolbar strong{font-size:16px}.ap-plan-project{width:210px}.ap-plan-search{width:160px}.ap-plan-inspector{grid-template-columns:1fr 1fr;max-height:210px}.ap-plan-detail-read{display:none}.ap-plan-footer{gap:6px}.ap-plan-tools button{padding:4px 6px}}
@media(max-width:550px){.ap-plan-toolbar{gap:4px}.ap-plan-project{width:calc(100% - 110px);max-width:none}.ap-plan-search{width:calc(100% - 140px)}.ap-plan-mobile-view{display:block}.ap-plan-inspector{grid-template-columns:1fr;max-height:220px}.ap-plan-detail-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.ap-plan-inspector>label{display:none}.ap-plan-split{grid-template-columns:minmax(0,1fr)}.ap-plan-divider{display:none}.ap-plan-split.table-view>.ap-plan-pane:last-child,.ap-plan-split.chart-view>.ap-plan-pane:first-child{display:none}.ap-plan-legend{display:none}.ap-plan-export label{max-width:100%;flex-wrap:wrap}.ap-plan-export input{width:210px}.ap-plan-help{display:none}}
`;
		//#endregion
		//#region src/client/project-plan-locales.js
		const keys$1 = [
			"title",
			"search",
			"all",
			"critical",
			"milestone",
			"incomplete",
			"expand",
			"collapse",
			"scale",
			"day",
			"week",
			"month",
			"fit",
			"locate",
			"today",
			"links",
			"details",
			"save",
			"undo",
			"redo",
			"reset",
			"name",
			"duration",
			"start",
			"finish",
			"percent",
			"predecessors",
			"resources",
			"notes",
			"readonly",
			"tasks",
			"visible",
			"calendars",
			"changed",
			"original",
			"manual",
			"loading",
			"empty",
			"noDates",
			"select",
			"format",
			"filename",
			"export",
			"cancel",
			"saving",
			"saved",
			"switch",
			"help"
		];
		const projectPlanLocales = Object.fromEntries(Object.entries({
			zh: [
				"项目计划",
				"搜索任务 / WBS",
				"全部任务",
				"关键任务",
				"里程碑",
				"未完成任务",
				"展开全部",
				"折叠全部",
				"时间刻度",
				"日",
				"周",
				"月",
				"适合窗口",
				"定位任务",
				"今天",
				"依赖连线",
				"任务详情",
				"另存并校验",
				"撤销",
				"重做",
				"恢复原计划",
				"任务名称",
				"源文件工期",
				"计划开始",
				"计划完成",
				"工期完成 %",
				"前置任务",
				"资源",
				"备注",
				"只读",
				"任务",
				"显示",
				"日历",
				"已编辑",
				"未编辑",
				"手动编辑 · 未自动排程",
				"正在本机读取项目计划…",
				"没有匹配的任务",
				"没有可显示的计划日期",
				"选择任务查看详情，双击任务名称编辑。",
				"导出格式",
				"新文件名",
				"导出并校验",
				"取消",
				"正在导出并校验…",
				"已保存",
				"切换项目将丢弃尚未导出的编辑，是否继续？",
				"可编辑名称、计划起止时间、工期完成率及备注。不会自动重排依赖或更改实际日期；工期显示源文件值。MPP 另存为 Project XML，P6 可导出 XER/XML。导出后请在 Project/P6 中复核。"
			],
			en: [
				"Project schedule",
				"Search tasks / WBS",
				"All tasks",
				"Critical tasks",
				"Milestones",
				"Incomplete tasks",
				"Expand all",
				"Collapse all",
				"Timescale",
				"Day",
				"Week",
				"Month",
				"Fit to window",
				"Locate task",
				"Today",
				"Dependency links",
				"Task details",
				"Save as and verify",
				"Undo",
				"Redo",
				"Restore original",
				"Task name",
				"Source duration",
				"Planned start",
				"Planned finish",
				"Duration complete %",
				"Predecessors",
				"Resources",
				"Notes",
				"Read only",
				"Tasks",
				"Visible",
				"Calendars",
				"Edited",
				"Unedited",
				"Manual editing · No automatic scheduling",
				"Reading schedule locally…",
				"No matching tasks",
				"No scheduled dates to display",
				"Select a task for details. Double-click its name to edit.",
				"Export format",
				"New filename",
				"Export and verify",
				"Cancel",
				"Exporting and verifying…",
				"Saved",
				"Switching projects discards edits not yet exported. Continue?",
				"Edit names, planned dates, duration completion and notes. Dependencies and actual dates are not rescheduled; duration shows the source value. Save MPP as Project XML, or P6 as XER/XML. Review the export in Project/P6."
			],
			es: [
				"Programa del proyecto",
				"Buscar tareas / EDT",
				"Todas las tareas",
				"Tareas críticas",
				"Hitos",
				"Tareas pendientes",
				"Expandir todo",
				"Contraer todo",
				"Escala temporal",
				"Día",
				"Semana",
				"Mes",
				"Ajustar a ventana",
				"Localizar tarea",
				"Hoy",
				"Vínculos de dependencia",
				"Detalles de tarea",
				"Guardar como y verificar",
				"Deshacer",
				"Rehacer",
				"Restaurar original",
				"Nombre de tarea",
				"Duración original",
				"Inicio previsto",
				"Fin previsto",
				"Duración completada %",
				"Predecesoras",
				"Recursos",
				"Notas",
				"Solo lectura",
				"Tareas",
				"Visibles",
				"Calendarios",
				"Modificado",
				"Sin modificar",
				"Edición manual · Sin programación automática",
				"Leyendo el programa localmente…",
				"No hay tareas coincidentes",
				"No hay fechas programadas",
				"Seleccione una tarea. Doble clic en el nombre para editar.",
				"Formato de exportación",
				"Nuevo nombre de archivo",
				"Exportar y verificar",
				"Cancelar",
				"Exportando y verificando…",
				"Guardado",
				"Cambiar de proyecto descarta las modificaciones sin exportar. ¿Continuar?",
				"Edite nombres, fechas previstas, avance por duración y notas. No se reprograman dependencias ni fechas reales; se muestra la duración original. MPP se guarda como Project XML; P6 como XER/XML. Revise el archivo en Project/P6."
			],
			fr: [
				"Planning du projet",
				"Rechercher tâches / WBS",
				"Toutes les tâches",
				"Tâches critiques",
				"Jalons",
				"Tâches inachevées",
				"Tout développer",
				"Tout réduire",
				"Échelle de temps",
				"Jour",
				"Semaine",
				"Mois",
				"Ajuster à la fenêtre",
				"Localiser la tâche",
				"Aujourd’hui",
				"Liens de dépendance",
				"Détails de la tâche",
				"Enregistrer sous et vérifier",
				"Annuler",
				"Rétablir",
				"Restaurer l’original",
				"Nom de tâche",
				"Durée d’origine",
				"Début prévu",
				"Fin prévue",
				"Durée achevée %",
				"Prédécesseurs",
				"Ressources",
				"Notes",
				"Lecture seule",
				"Tâches",
				"Visibles",
				"Calendriers",
				"Modifié",
				"Non modifié",
				"Édition manuelle · Sans planification automatique",
				"Lecture locale du planning…",
				"Aucune tâche correspondante",
				"Aucune date planifiée",
				"Sélectionnez une tâche. Double-cliquez sur son nom pour modifier.",
				"Format d’export",
				"Nouveau nom de fichier",
				"Exporter et vérifier",
				"Annuler",
				"Export et vérification…",
				"Enregistré",
				"Changer de projet abandonne les modifications non exportées. Continuer ?",
				"Modifiez les noms, dates prévues, avancement en durée et notes. Les dépendances et dates réelles ne sont pas recalculées ; la durée reste celle du fichier source. MPP est exporté en Project XML, P6 en XER/XML. Vérifiez dans Project/P6."
			],
			de: [
				"Projektterminplan",
				"Aufgaben / PSP suchen",
				"Alle Vorgänge",
				"Kritische Vorgänge",
				"Meilensteine",
				"Unvollständige Vorgänge",
				"Alles erweitern",
				"Alles reduzieren",
				"Zeitskala",
				"Tag",
				"Woche",
				"Monat",
				"An Fenster anpassen",
				"Vorgang anzeigen",
				"Heute",
				"Abhängigkeiten",
				"Vorgangsdetails",
				"Speichern unter und prüfen",
				"Rückgängig",
				"Wiederholen",
				"Original wiederherstellen",
				"Vorgangsname",
				"Ursprüngliche Dauer",
				"Geplanter Anfang",
				"Geplantes Ende",
				"Dauer abgeschlossen %",
				"Vorgänger",
				"Ressourcen",
				"Notizen",
				"Schreibgeschützt",
				"Vorgänge",
				"Sichtbar",
				"Kalender",
				"Bearbeitet",
				"Unverändert",
				"Manuelle Bearbeitung · Keine automatische Planung",
				"Terminplan wird lokal gelesen…",
				"Keine passenden Vorgänge",
				"Keine geplanten Termine",
				"Vorgang auswählen. Zum Bearbeiten auf den Namen doppelklicken.",
				"Exportformat",
				"Neuer Dateiname",
				"Exportieren und prüfen",
				"Abbrechen",
				"Exportieren und prüfen…",
				"Gespeichert",
				"Projektwechsel verwirft noch nicht exportierte Änderungen. Fortfahren?",
				"Namen, geplante Termine, Dauerfortschritt und Notizen sind bearbeitbar. Abhängigkeiten und Ist-Termine werden nicht neu berechnet; die Dauer bleibt der Quellwert. MPP wird als Project XML, P6 als XER/XML gespeichert. In Project/P6 prüfen."
			],
			ja: [
				"プロジェクト工程表",
				"タスク / WBS を検索",
				"すべてのタスク",
				"クリティカルタスク",
				"マイルストーン",
				"未完了タスク",
				"すべて展開",
				"すべて折りたたむ",
				"時間軸",
				"日",
				"週",
				"月",
				"ウィンドウに合わせる",
				"タスクへ移動",
				"今日",
				"依存関係",
				"タスク詳細",
				"名前を付けて保存・検証",
				"元に戻す",
				"やり直す",
				"元の計画に戻す",
				"タスク名",
				"元ファイルの期間",
				"予定開始",
				"予定終了",
				"期間完了率 %",
				"先行タスク",
				"リソース",
				"メモ",
				"読み取り専用",
				"タスク",
				"表示",
				"カレンダー",
				"編集済み",
				"未編集",
				"手動編集 · 自動スケジュールなし",
				"工程表をローカルで読み込み中…",
				"一致するタスクはありません",
				"表示できる予定日がありません",
				"タスクを選択して詳細を表示。名前をダブルクリックして編集。",
				"出力形式",
				"新しいファイル名",
				"出力・検証",
				"キャンセル",
				"出力・検証中…",
				"保存済み",
				"プロジェクトを切り替えると未出力の編集内容が失われます。続行しますか？",
				"名前、予定日、期間完了率、メモを編集できます。依存関係や実績日は再計算しません。期間は元ファイルの値です。MPP は Project XML、P6 は XER/XML として出力します。Project/P6 で確認してください。"
			],
			ko: [
				"프로젝트 일정",
				"작업 / WBS 검색",
				"모든 작업",
				"주요 경로 작업",
				"마일스톤",
				"미완료 작업",
				"모두 펼치기",
				"모두 접기",
				"시간 눈금",
				"일",
				"주",
				"월",
				"창에 맞추기",
				"작업으로 이동",
				"오늘",
				"선후행 연결",
				"작업 상세",
				"다른 이름으로 저장 및 검증",
				"실행 취소",
				"다시 실행",
				"원본 복원",
				"작업 이름",
				"원본 기간",
				"계획 시작",
				"계획 완료",
				"기간 완료율 %",
				"선행 작업",
				"자원",
				"메모",
				"읽기 전용",
				"작업",
				"표시",
				"달력",
				"수정됨",
				"수정 없음",
				"수동 편집 · 자동 일정 계산 없음",
				"일정을 로컬에서 읽는 중…",
				"일치하는 작업 없음",
				"표시할 계획 날짜 없음",
				"작업을 선택하세요. 이름을 두 번 클릭하여 편집합니다.",
				"내보내기 형식",
				"새 파일 이름",
				"내보내기 및 검증",
				"취소",
				"내보내기 및 검증 중…",
				"저장됨",
				"프로젝트를 변경하면 내보내지 않은 수정 사항이 사라집니다. 계속할까요?",
				"이름, 계획 날짜, 기간 완료율, 메모를 편집할 수 있습니다. 선후행 관계와 실제 날짜는 재계산하지 않으며 기간은 원본 값입니다. MPP는 Project XML, P6는 XER/XML로 저장합니다. Project/P6에서 확인하세요."
			],
			pt: [
				"Cronograma do projeto",
				"Pesquisar tarefas / EAP",
				"Todas as tarefas",
				"Tarefas críticas",
				"Marcos",
				"Tarefas incompletas",
				"Expandir tudo",
				"Recolher tudo",
				"Escala temporal",
				"Dia",
				"Semana",
				"Mês",
				"Ajustar à janela",
				"Localizar tarefa",
				"Hoje",
				"Ligações de dependência",
				"Detalhes da tarefa",
				"Salvar como e verificar",
				"Desfazer",
				"Refazer",
				"Restaurar original",
				"Nome da tarefa",
				"Duração original",
				"Início planejado",
				"Término planejado",
				"Duração concluída %",
				"Predecessoras",
				"Recursos",
				"Notas",
				"Somente leitura",
				"Tarefas",
				"Visíveis",
				"Calendários",
				"Editado",
				"Sem alterações",
				"Edição manual · Sem agendamento automático",
				"Lendo cronograma localmente…",
				"Nenhuma tarefa correspondente",
				"Nenhuma data planejada",
				"Selecione uma tarefa. Clique duas vezes no nome para editar.",
				"Formato de exportação",
				"Novo nome do arquivo",
				"Exportar e verificar",
				"Cancelar",
				"Exportando e verificando…",
				"Salvo",
				"Mudar de projeto descarta alterações ainda não exportadas. Continuar?",
				"Edite nomes, datas planejadas, avanço por duração e notas. Dependências e datas reais não são recalculadas; a duração é a do arquivo original. MPP é salvo como Project XML; P6 como XER/XML. Revise no Project/P6."
			],
			ru: [
				"Календарный план проекта",
				"Поиск задач / СДР",
				"Все задачи",
				"Критические задачи",
				"Вехи",
				"Незавершённые задачи",
				"Развернуть всё",
				"Свернуть всё",
				"Шкала времени",
				"День",
				"Неделя",
				"Месяц",
				"По ширине окна",
				"Перейти к задаче",
				"Сегодня",
				"Связи задач",
				"Сведения о задаче",
				"Сохранить как и проверить",
				"Отменить",
				"Повторить",
				"Восстановить исходный",
				"Название задачи",
				"Исходная длительность",
				"Плановое начало",
				"Плановое окончание",
				"Завершение по длительности %",
				"Предшественники",
				"Ресурсы",
				"Примечания",
				"Только чтение",
				"Задачи",
				"Показано",
				"Календари",
				"Изменено",
				"Без изменений",
				"Ручное редактирование · Без автоматического планирования",
				"Локальное чтение плана…",
				"Подходящих задач нет",
				"Нет плановых дат",
				"Выберите задачу. Дважды щёлкните название для изменения.",
				"Формат экспорта",
				"Новое имя файла",
				"Экспортировать и проверить",
				"Отмена",
				"Экспорт и проверка…",
				"Сохранено",
				"При смене проекта неэкспортированные изменения будут потеряны. Продолжить?",
				"Можно менять названия, плановые даты, завершение по длительности и примечания. Связи и фактические даты не пересчитываются; длительность исходная. MPP сохраняется как Project XML, P6 как XER/XML. Проверьте в Project/P6."
			],
			ar: [
				"الجدول الزمني للمشروع",
				"بحث المهام / WBS",
				"جميع المهام",
				"المهام الحرجة",
				"المعالم",
				"المهام غير المكتملة",
				"توسيع الكل",
				"طي الكل",
				"مقياس الزمن",
				"يوم",
				"أسبوع",
				"شهر",
				"ملاءمة النافذة",
				"تحديد موقع المهمة",
				"اليوم",
				"روابط الاعتماد",
				"تفاصيل المهمة",
				"حفظ باسم والتحقق",
				"تراجع",
				"إعادة",
				"استعادة الأصل",
				"اسم المهمة",
				"المدة الأصلية",
				"البداية المخططة",
				"النهاية المخططة",
				"اكتمال المدة %",
				"المهام السابقة",
				"الموارد",
				"ملاحظات",
				"للقراءة فقط",
				"المهام",
				"المعروضة",
				"التقويمات",
				"تم التعديل",
				"دون تعديل",
				"تحرير يدوي · دون جدولة تلقائية",
				"قراءة الجدول محليًا…",
				"لا توجد مهام مطابقة",
				"لا توجد تواريخ مخططة",
				"اختر مهمة لعرض التفاصيل. انقر مرتين على الاسم لتحريره.",
				"صيغة التصدير",
				"اسم الملف الجديد",
				"تصدير والتحقق",
				"إلغاء",
				"جارٍ التصدير والتحقق…",
				"تم الحفظ",
				"تغيير المشروع يلغي التعديلات التي لم تُصدّر. هل تريد المتابعة؟",
				"يمكن تحرير الأسماء والتواريخ المخططة ونسبة اكتمال المدة والملاحظات. لا تُعاد جدولة العلاقات أو التواريخ الفعلية؛ المدة من الملف الأصلي. يُحفظ MPP بصيغة Project XML، وP6 بصيغة XER/XML. راجع النتيجة في Project/P6."
			]
		}).map(([lang, strings]) => [lang, Object.fromEntries(keys$1.map((key, i) => [key, strings[i]]))]));
		for (const [lang, [view, gantt, exportWarning]] of Object.entries({
			zh: [
				"视图",
				"甘特图",
				"已另存并重新读取验证。格式转换可能丢失原软件特有字段；请在 Project/P6 中复核日历、依赖、资源及基线。"
			],
			en: [
				"View",
				"Gantt chart",
				"Saved and verified by reopening. Conversion may lose source-specific fields; review calendars, dependencies, resources and baselines in Project/P6."
			],
			es: [
				"Vista",
				"Diagrama de Gantt",
				"Guardado y verificado al volver a abrir. La conversión puede perder campos específicos; revise calendarios, dependencias, recursos y líneas base en Project/P6."
			],
			fr: [
				"Vue",
				"Diagramme de Gantt",
				"Enregistré et vérifié par relecture. La conversion peut perdre des champs spécifiques ; vérifiez calendriers, dépendances, ressources et références dans Project/P6."
			],
			de: [
				"Ansicht",
				"Gantt-Diagramm",
				"Gespeichert und durch erneutes Lesen geprüft. Formatspezifische Felder können verloren gehen; Kalender, Abhängigkeiten, Ressourcen und Basispläne in Project/P6 prüfen."
			],
			ja: [
				"表示",
				"ガントチャート",
				"保存後に再読み込みして検証済みです。変換で固有の項目が失われる場合があります。Project/P6 でカレンダー、依存関係、リソース、基準計画を確認してください。"
			],
			ko: [
				"보기",
				"간트 차트",
				"저장 후 다시 읽어 검증했습니다. 변환 시 고유 필드가 손실될 수 있으므로 Project/P6에서 달력, 선후행 관계, 자원, 기준선을 확인하세요."
			],
			pt: [
				"Visualização",
				"Gráfico de Gantt",
				"Salvo e verificado por releitura. A conversão pode perder campos específicos; revise calendários, dependências, recursos e linhas de base no Project/P6."
			],
			ru: [
				"Вид",
				"Диаграмма Ганта",
				"Файл сохранён и проверен повторным чтением. При преобразовании могут потеряться специфические поля; проверьте календари, связи, ресурсы и базовые планы в Project/P6."
			],
			ar: [
				"العرض",
				"مخطط جانت",
				"تم الحفظ والتحقق بإعادة القراءة. قد تفقد عملية التحويل حقولًا خاصة؛ راجع التقويمات والعلاقات والموارد والخطط الأساسية في Project/P6."
			]
		})) Object.assign(projectPlanLocales[lang], {
			view,
			gantt,
			exportWarning
		});
		function planTranslator(lang) {
			return (key) => projectPlanLocales[lang]?.[key] || projectPlanLocales.en[key] || key;
		}
		//#endregion
		//#region src/client/project-plan-preview.js
		const EMPTY_TASKS = [];
		function createProjectPlanPreview({ React, api, Icon, useApLang }) {
			const h = React.createElement;
			const icon = (name, size = 14) => {
				if (name === "chevronRight" || name === "chevronDown" || name === "undo" || name === "redo") return h("svg", {
					width: size,
					height: size,
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 1.6,
					"aria-hidden": true,
					style: name === "redo" ? { transform: "scaleX(-1)" } : void 0
				}, h("path", {
					d: name === "chevronRight" ? "m9 6 6 6-6 6" : name === "chevronDown" ? "m6 9 6 6 6-6" : "M3 10h10a6 6 0 0 1 0 12M3 10l5-5M3 10l5 5",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				}));
				return Icon ? Icon(name, size) : null;
			};
			return function ProjectPlanPreview({ cwd, path, onEditState }) {
				const lang = useApLang ? useApLang() : "zh", t = planTranslator(lang);
				const [plan, setPlan] = React.useState(null);
				const [error, setError] = React.useState(""), [status, setStatus] = React.useState("");
				const [busy, setBusy] = React.useState(false), [projectIndex, setProjectIndex] = React.useState(0);
				const [history, setHistory] = React.useState({
					past: [],
					present: {},
					future: []
				});
				const edits = history.present;
				const [savedEdits, setSavedEdits] = React.useState("{}"), dirty = JSON.stringify(edits) !== savedEdits;
				const [selectedKey, setSelectedKey] = React.useState(null), [collapsed, setCollapsed] = React.useState(/* @__PURE__ */ new Set());
				const [query, setQuery] = React.useState(""), [filter, setFilter] = React.useState("all"), [scale, setScale] = React.useState("week");
				const [showLinks, setShowLinks] = React.useState(true), [showDetails, setShowDetails] = React.useState(true);
				const [exportOpen, setExportOpen] = React.useState(false), [inlineKey, setInlineKey] = React.useState(null);
				const [inlineName, setInlineName] = React.useState("");
				const [format, setFormat] = React.useState(/\.xer$/i.test(path) ? "xer" : /\.pmxml$/i.test(path) ? "pmxml" : "mspdi");
				const [filename, setFilename] = React.useState(path.replaceAll("\\", "/").split("/").at(-1).replace(/\.[^.]+$/, "") + "-revision");
				const [viewport, setViewport] = React.useState({
					height: 500,
					width: 700
				});
				const [scroll, setScroll] = React.useState({
					top: 0,
					tableLeft: 0,
					chartLeft: 0
				}), [split, setSplit] = React.useState(52);
				const [mobilePane, setMobilePane] = React.useState("table");
				const tableRef = React.useRef(null), chartRef = React.useRef(null), splitRef = React.useRef(null), dragRef = React.useRef(null);
				const markerId = "plan-arrow-" + React.useId().replace(/[^a-z0-9]/gi, "");
				React.useEffect(() => {
					onEditState?.({
						dirty,
						busy
					});
					const warn = (event) => {
						event.preventDefault();
						event.returnValue = "";
					};
					if (dirty || busy) window.addEventListener("beforeunload", warn);
					return () => window.removeEventListener("beforeunload", warn);
				}, [
					dirty,
					busy,
					onEditState
				]);
				React.useEffect(() => {
					const abort = new AbortController();
					api("/api/agent-pi/files/plan?path=" + encodeURIComponent(path), cwd, { signal: abort.signal }).then((value) => {
						if (!abort.signal.aborted) setPlan(value);
					}).catch((error) => {
						if (!abort.signal.aborted) setError(error.message);
					});
					return () => abort.abort();
				}, [cwd, path]);
				React.useEffect(() => {
					const node = chartRef.current;
					if (!node) return;
					const update = () => setViewport({
						height: Math.max(node.clientHeight, tableRef.current?.clientHeight || 0),
						width: node.clientWidth || splitRef.current?.clientWidth || 700
					});
					const observer = new ResizeObserver(update);
					observer.observe(node);
					if (tableRef.current) observer.observe(tableRef.current);
					update();
					for (const pane of [tableRef.current, chartRef.current]) if (pane?.clientHeight) pane.scrollTop = scroll.top;
					return () => observer.disconnect();
				}, [
					plan,
					showDetails,
					exportOpen,
					mobilePane
				]);
				const tasks = plan?.projects[projectIndex]?.tasks || EMPTY_TASKS;
				const rows = React.useMemo(() => taskRows(tasks, edits), [tasks, edits]);
				const rowByKey = React.useMemo(() => new Map(rows.map((row) => [row.key, row])), [rows]);
				const rowByUid = React.useMemo(() => new Map(rows.filter((row) => row.uid != null).map((row) => [String(row.uid), row])), [rows]);
				const visible = React.useMemo(() => visibleTaskRows(rows, {
					collapsed,
					query,
					filter
				}), [
					rows,
					collapsed,
					query,
					filter
				]);
				const visibleIndex = React.useMemo(() => new Map(visible.map((row, index) => [row.key, index])), [visible]);
				const selected = rowByKey.get(selectedKey) || null;
				const range = React.useMemo(() => timelineRange(rows, scale, viewport.width), [
					rows,
					scale,
					viewport.width
				]);
				const ticks = React.useMemo(() => timelineTicks(range, scale), [range, scale]);
				const windowRows = virtualWindow(visible.length, scroll.top, viewport.height);
				const links = React.useMemo(() => showLinks ? dependencyPaths(visible, range, windowRows.from, windowRows.to) : [], [
					visible,
					range,
					windowRows.from,
					windowRows.to,
					showLinks
				]);
				const dateText = (value) => value ? String(value).slice(0, 10).replaceAll("-", "/") : "—";
				const tickText = (value, month = false) => new Intl.DateTimeFormat(lang, {
					timeZone: "UTC",
					...month ? {
						year: "numeric",
						month: "short"
					} : {
						month: "numeric",
						day: "numeric"
					}
				}).format(new Date(value));
				const dependencyText = (row) => (row.predecessors || []).map((link) => {
					return `${rowByUid.get(String(link.uid))?.id ?? link.uid}${relationCode(link.type) || link.type || ""}${link.lag && !/^0(?:\.0+)?\D/.test(link.lag) ? " " + link.lag : ""}`;
				}).join(", ");
				const synchronize = (side, node) => {
					const other = side === "table" ? chartRef.current : tableRef.current;
					if (other && Math.abs(other.scrollTop - node.scrollTop) > 1) other.scrollTop = node.scrollTop;
					setScroll((previous) => ({
						...previous,
						top: node.scrollTop,
						[side === "table" ? "tableLeft" : "chartLeft"]: node.scrollLeft
					}));
				};
				React.useEffect(() => {
					for (const node of [tableRef.current, chartRef.current]) if (node) node.scrollTop = 0;
					setScroll((previous) => ({
						...previous,
						top: 0
					}));
				}, [
					query,
					filter,
					collapsed,
					projectIndex
				]);
				const selectTask = (row, locate = false) => {
					if (!row) return;
					setSelectedKey(row.key);
					if (!locate) return;
					setQuery("");
					setFilter("all");
					const expanded = new Set(collapsed);
					row.parents.forEach((key) => expanded.delete(key));
					setCollapsed(expanded);
					requestAnimationFrame(() => requestAnimationFrame(() => {
						const index = visibleTaskRows(rows, { collapsed: expanded }).findIndex((item) => item.key === row.key);
						const top = Math.max(0, index * 28 - viewport.height / 3);
						for (const node of [tableRef.current, chartRef.current]) if (node) node.scrollTop = top;
						const shape = taskGeometry(row, range);
						if (shape && chartRef.current) chartRef.current.scrollLeft = Math.max(0, shape.left - viewport.width / 3);
					}));
				};
				const toggle = (row) => setCollapsed((previous) => {
					const next = new Set(previous);
					if (next.has(row.key)) next.delete(row.key);
					else next.add(row.key);
					return next;
				});
				const change = (row, key, value) => {
					if (busy || row.uid == null) return;
					setStatus("");
					setHistory((previous) => {
						if ((previous.present[row.uid]?.[key] ?? row[key] ?? "") === (value ?? "")) return previous;
						const next = {
							...previous.present,
							[row.uid]: {
								...previous.present[row.uid],
								uid: row.uid,
								[key]: value
							}
						};
						if ((tasks[row.sourceIndex]?.[key] ?? "") === (value ?? "")) {
							delete next[row.uid][key];
							if (Object.keys(next[row.uid]).length === 1) delete next[row.uid];
						}
						return {
							past: [...previous.past.slice(-79), previous.present],
							present: next,
							future: []
						};
					});
				};
				const undo = () => {
					setStatus("");
					setHistory((previous) => previous.past.length ? {
						past: previous.past.slice(0, -1),
						present: previous.past.at(-1),
						future: [previous.present, ...previous.future]
					} : previous);
				};
				const redo = () => {
					setStatus("");
					setHistory((previous) => previous.future.length ? {
						past: [...previous.past, previous.present],
						present: previous.future[0],
						future: previous.future.slice(1)
					} : previous);
				};
				const exportPlan = async () => {
					setBusy(true);
					setError("");
					setStatus("");
					try {
						setStatus({ filename: (await api("/api/agent-pi/files/plan/export", cwd, {
							method: "POST",
							body: JSON.stringify({
								path,
								revision: plan.revision,
								projectIndex,
								changes: Object.values(edits),
								format,
								filename
							})
						})).filename });
						setSavedEdits(JSON.stringify(edits));
						setExportOpen(false);
						window.dispatchEvent(new Event("agent-pi-files-changed"));
					} catch (error) {
						setError(error.message);
					} finally {
						setBusy(false);
					}
				};
				const control = (label, handler, disabled = false, symbol, extra = {}) => h("button", {
					type: "button",
					title: label,
					onClick: handler,
					disabled,
					...extra
				}, symbol ? icon(symbol) : null, label);
				const field = (row, key, label, type = "text") => h("label", { className: key === "name" ? "name" : void 0 }, t(label), h(key === "notes" ? "textarea" : "input", {
					type: key === "notes" ? void 0 : type,
					"aria-label": t(label),
					disabled: busy || row.uid == null,
					value: row[key] ?? "",
					...type === "number" ? {
						min: 0,
						max: 100,
						step: 1
					} : {},
					...type === "datetime-local" ? { step: 1 } : {},
					onChange: (event) => change(row, key, type === "number" ? Number(event.target.value) : event.target.value || (type === "datetime-local" ? null : ""))
				}));
				const moveSelection = (event, row) => {
					if (event.target.tagName === "INPUT") return;
					const index = visibleIndex.get(row.key);
					if (event.key === "ArrowDown" || event.key === "ArrowUp") {
						event.preventDefault();
						const next = visible[Math.max(0, Math.min(visible.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))];
						selectTask(next);
						const node = tableRef.current, targetIndex = visibleIndex.get(next.key);
						if (node && (targetIndex * 28 < node.scrollTop || (targetIndex + 1) * 28 > node.scrollTop + node.clientHeight)) node.scrollTop = Math.max(0, targetIndex * 28 - node.clientHeight / 2);
						requestAnimationFrame(() => tableRef.current?.querySelector(`[data-index="${targetIndex}"]`)?.focus({ preventScroll: true }));
					} else if (event.key === "ArrowLeft" && row.hasChildren && !collapsed.has(row.key) || event.key === "ArrowRight" && row.hasChildren && collapsed.has(row.key)) {
						event.preventDefault();
						toggle(row);
					} else if (event.key === "Enter") {
						event.preventDefault();
						setShowDetails(true);
						selectTask(row);
					}
				};
				const rowContent = (row, index) => h("div", {
					key: row.key,
					role: "row",
					"aria-rowindex": index + 2,
					"aria-selected": selectedKey === row.key,
					"aria-expanded": row.hasChildren ? !collapsed.has(row.key) : void 0,
					"data-index": index,
					className: "ap-plan-task-row" + (selectedKey === row.key ? " selected" : "") + (row.summary ? " summary" : ""),
					style: { top: index * 28 },
					tabIndex: selectedKey === row.key || !selectedKey && index === 0 ? 0 : -1,
					onClick: () => selectTask(row),
					onKeyDown: (event) => moveSelection(event, row)
				}, h("div", {
					role: "gridcell",
					className: "ap-plan-cell row-number"
				}, row.id ?? row.sourceIndex + 1), h("div", {
					role: "gridcell",
					className: "ap-plan-cell",
					title: row.wbs || row.activityId || ""
				}, row.wbs || row.activityId || "—"), h("div", {
					role: "gridcell",
					className: "ap-plan-cell task-name",
					style: { paddingLeft: 6 + Math.min(12, row.parents.length) * 14 },
					title: row.name || "",
					onDoubleClick: () => {
						if (!busy && row.uid != null) {
							setInlineKey(row.key);
							setInlineName(row.name || "");
						}
					}
				}, row.hasChildren ? h("button", {
					type: "button",
					"aria-label": (collapsed.has(row.key) ? t("expand") : t("collapse")) + ": " + row.name,
					onClick: (event) => {
						event.stopPropagation();
						toggle(row);
					}
				}, icon(collapsed.has(row.key) ? "chevronRight" : "chevronDown", 12)) : h("i", { className: "ap-plan-caret-space" }), inlineKey === row.key ? h("input", {
					autoFocus: true,
					value: inlineName,
					"aria-label": t("name"),
					onChange: (event) => setInlineName(event.target.value),
					onClick: (event) => event.stopPropagation(),
					onBlur: () => {
						change(row, "name", inlineName);
						setInlineKey(null);
					},
					onKeyDown: (event) => {
						if (event.key === "Enter") event.target.blur();
						if (event.key === "Escape") setInlineKey(null);
					}
				}) : h("span", null, row.name || "—"), edits[row.uid] ? h("i", {
					className: "ap-plan-modified",
					title: t("changed")
				}, "•") : null), ...[
					row.duration || "—",
					dateText(row.start),
					dateText(row.finish),
					`${Number(row.percent || 0).toFixed(0)}%`,
					dependencyText(row) || "—"
				].map((value, i) => h("div", {
					key: i,
					role: "gridcell",
					className: "ap-plan-cell",
					title: String(value)
				}, value)));
				if (!plan) return h("div", { className: "ap-plan" }, h("style", null, projectPlanCss), h("div", {
					className: "ap-plan-empty",
					role: error ? "alert" : "status"
				}, error || t("loading")));
				const project = plan.projects[projectIndex], today = /* @__PURE__ */ new Date();
				const todayX = range?.x(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
				return h("section", {
					className: "ap-plan",
					"aria-label": t("title"),
					dir: lang === "ar" ? "rtl" : "ltr",
					onKeyDown: (event) => {
						if (!busy && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && ![
							"INPUT",
							"TEXTAREA",
							"SELECT"
						].includes(event.target.tagName)) {
							event.preventDefault();
							if (event.shiftKey) redo();
							else undo();
						}
					}
				}, h("style", null, projectPlanCss), h("div", { className: "ap-plan-toolbar" }, h("strong", null, t("title")), h("select", {
					className: "ap-plan-project",
					"aria-label": t("title"),
					value: projectIndex,
					disabled: busy,
					onChange: (event) => {
						if (dirty && !window.confirm(t("switch"))) return;
						setProjectIndex(Number(event.target.value));
						setHistory({
							past: [],
							present: {},
							future: []
						});
						setSavedEdits("{}");
						setCollapsed(/* @__PURE__ */ new Set());
						setSelectedKey(null);
						setInlineKey(null);
						setStatus("");
						setError("");
						setQuery("");
						setFilter("all");
					}
				}, plan.projects.map((item, index) => h("option", {
					key: index,
					value: index
				}, item.name || `${t("title")} ${index + 1}`))), h("input", {
					className: "ap-plan-search",
					type: "search",
					placeholder: t("search"),
					"aria-label": t("search"),
					value: query,
					onChange: (event) => setQuery(event.target.value)
				}), h("select", {
					"aria-label": t("tasks"),
					value: filter,
					onChange: (event) => setFilter(event.target.value)
				}, [
					"all",
					"critical",
					"milestone",
					"incomplete"
				].map((value) => h("option", {
					key: value,
					value
				}, t(value)))), h("select", {
					className: "ap-plan-mobile-view",
					"aria-label": t("view"),
					value: mobilePane,
					onChange: (event) => setMobilePane(event.target.value)
				}, h("option", { value: "table" }, t("tasks")), h("option", { value: "chart" }, t("gantt"))), h("div", { className: "ap-plan-tools" }, control(t("expand"), () => setCollapsed(/* @__PURE__ */ new Set()), false, "chevronDown"), control(t("collapse"), () => setCollapsed(new Set(rows.filter((row) => row.hasChildren).map((row) => row.key))), false, "chevronRight"), h("select", {
					"aria-label": t("scale"),
					value: scale,
					onChange: (event) => {
						setScale(event.target.value);
						if (chartRef.current) chartRef.current.scrollLeft = 0;
					}
				}, [
					"day",
					"week",
					"month",
					"fit"
				].map((value) => h("option", {
					key: value,
					value
				}, t(value)))), control(t("locate"), () => selectTask(selected, true), !selected || !taskGeometry(selected, range), "search"), control(t("today"), () => {
					if (chartRef.current) chartRef.current.scrollLeft = Math.max(0, todayX - viewport.width / 2);
				}, !range || todayX < 0 || todayX > range.width), h("label", null, h("input", {
					type: "checkbox",
					checked: showLinks,
					onChange: (event) => setShowLinks(event.target.checked)
				}), t("links")), control(t("details"), () => setShowDetails((value) => !value), false, void 0, { "aria-pressed": showDetails }), control(t("undo"), undo, busy || !history.past.length, "undo"), control(t("redo"), redo, busy || !history.future.length, "redo"), control(t("save"), () => setExportOpen((value) => !value), busy, "save", {
					className: "primary",
					"aria-expanded": exportOpen
				}))), exportOpen ? h("div", { className: "ap-plan-export" }, h("label", null, t("format"), h("select", {
					value: format,
					disabled: busy,
					onChange: (event) => setFormat(event.target.value)
				}, h("option", { value: "mspdi" }, "Project XML"), h("option", { value: "pmxml" }, "P6 XML"), h("option", { value: "xer" }, "P6 XER · UTF-8"))), h("label", null, t("filename"), h("input", {
					value: filename,
					disabled: busy,
					onChange: (event) => setFilename(event.target.value)
				})), control(busy ? t("saving") : t("export"), exportPlan, busy || !filename.trim(), "save", { className: "primary" }), control(t("cancel"), () => setExportOpen(false), busy)) : null, error ? h("div", {
					className: "ap-plan-message error",
					role: "alert"
				}, error) : null, status ? h("div", {
					className: "ap-plan-message success",
					role: "status"
				}, `${t("saved")}: ${status.filename}. ${t("exportWarning")}`) : null, h("div", {
					className: `ap-plan-split ${mobilePane}-view`,
					ref: splitRef,
					style: { "--ap-plan-table": `${split}%` }
				}, h("div", { className: "ap-plan-pane" }, h("div", { className: "ap-plan-header" }, h("div", {
					className: "ap-plan-grid-head",
					role: "row",
					style: { transform: `translateX(${-scroll.tableLeft}px)` }
				}, [
					"ID",
					"WBS",
					t("name"),
					t("duration"),
					t("start"),
					t("finish"),
					t("percent"),
					t("predecessors")
				].map((label) => h("div", {
					key: label,
					role: "columnheader",
					title: label
				}, label)))), h("div", {
					className: "ap-plan-scroll",
					ref: tableRef,
					onScroll: (event) => synchronize("table", event.currentTarget)
				}, h("div", {
					className: "ap-plan-grid-content",
					role: "grid",
					"aria-label": t("tasks"),
					"aria-rowcount": visible.length + 1,
					style: { height: visible.length * 28 }
				}, visible.slice(windowRows.from, windowRows.to).map((row, offset) => rowContent(row, windowRows.from + offset)), !visible.length ? h("div", { className: "ap-plan-empty" }, t("empty")) : null))), h("div", {
					className: "ap-plan-divider",
					role: "separator",
					tabIndex: 0,
					"aria-label": t("title"),
					"aria-orientation": "vertical",
					"aria-valuenow": split,
					"aria-valuemin": 25,
					"aria-valuemax": 75,
					onPointerDown: (event) => {
						dragRef.current = event.pointerId;
						event.currentTarget.setPointerCapture(event.pointerId);
					},
					onPointerMove: (event) => {
						if (dragRef.current !== event.pointerId) return;
						const rect = splitRef.current.getBoundingClientRect();
						setSplit(Math.max(25, Math.min(75, (event.clientX - rect.left) / rect.width * 100)));
					},
					onPointerUp: () => {
						dragRef.current = null;
					},
					onPointerCancel: () => {
						dragRef.current = null;
					},
					onKeyDown: (event) => {
						if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
							event.preventDefault();
							setSplit((value) => Math.max(25, Math.min(75, value + (event.key === "ArrowLeft" ? -2 : 2))));
						}
					}
				}), h("div", { className: "ap-plan-pane" }, h("div", { className: "ap-plan-header" }, h("div", {
					className: "ap-plan-ruler",
					style: {
						width: range?.width || "100%",
						transform: `translateX(${-scroll.chartLeft}px)`
					}
				}, ...ticks.months.map((tick) => h("div", {
					key: `m:${tick.date}`,
					className: "ap-plan-ruler-cell",
					style: {
						left: range.x(tick.start),
						width: range.x(tick.end) - range.x(tick.start)
					}
				}, tickText(tick.date, true))), ...ticks.units.map((tick) => h("div", {
					key: `u:${tick.date}`,
					className: "ap-plan-ruler-cell unit",
					style: {
						left: range.x(tick.start),
						width: range.x(tick.end) - range.x(tick.start)
					}
				}, tickText(tick.date))))), h("div", {
					className: "ap-plan-scroll",
					ref: chartRef,
					onScroll: (event) => synchronize("chart", event.currentTarget)
				}, h("div", {
					className: "ap-plan-chart-content",
					style: {
						width: range?.width || "100%",
						height: visible.length * 28
					}
				}, h("div", { className: "ap-plan-chart-grid" }, ticks.units.map((tick) => h("i", {
					key: tick.date,
					className: "ap-plan-tick",
					style: { left: range.x(tick.start) }
				}))), visible.slice(windowRows.from, windowRows.to).map((row, offset) => {
					const index = windowRows.from + offset, shape = taskGeometry(row, range);
					return h("div", {
						key: row.key,
						className: "ap-plan-chart-row" + (selectedKey === row.key ? " selected" : ""),
						style: { top: index * 28 },
						onClick: () => selectTask(row)
					}, shape ? h("button", {
						type: "button",
						className: "ap-plan-bar" + (row.summary ? " summary" : row.milestone ? " milestone" : "") + (row.critical ? " critical" : "") + (selectedKey === row.key ? " selected" : ""),
						style: {
							left: shape.left,
							width: shape.width
						},
						"aria-label": row.name || String(row.uid),
						title: `${row.name}\n${dateText(row.start)} → ${dateText(row.finish)} · ${Number(row.percent || 0)}%`,
						onClick: (event) => {
							event.stopPropagation();
							selectTask(row);
						}
					}, !row.summary && !row.milestone ? h("span", {
						className: "ap-plan-progress",
						style: { width: `${Math.max(0, Math.min(100, Number(row.percent || 0)))}%` }
					}) : null) : null);
				}), range && showLinks ? h("svg", {
					className: "ap-plan-links",
					width: range.width,
					height: visible.length * 28,
					"aria-hidden": true
				}, h("defs", null, h("marker", {
					id: markerId,
					viewBox: "0 0 6 6",
					refX: 5,
					refY: 3,
					markerWidth: 5,
					markerHeight: 5,
					orient: "auto-start-reverse"
				}, h("path", {
					d: "M0,0 L6,3 L0,6 Z",
					fill: "#6592b8"
				}))), links.map((link) => h("path", {
					key: link.key,
					d: link.path,
					fill: "none",
					stroke: selectedKey === link.targetKey || selectedKey === link.sourceKey ? "#217ac0" : "#94b9d8",
					strokeWidth: selectedKey === link.targetKey || selectedKey === link.sourceKey ? 1.5 : 1,
					markerEnd: `url(#${markerId})`
				}))) : null, range && todayX >= 0 && todayX <= range.width ? h("div", {
					className: "ap-plan-today",
					style: { left: todayX }
				}, h("span", null, t("today"))) : null, !range ? h("div", { className: "ap-plan-empty" }, t("noDates")) : null)))), showDetails ? selected ? h("div", { className: "ap-plan-inspector" }, h("div", { className: "ap-plan-detail-fields" }, field(selected, "name", "name"), field(selected, "start", "start", "datetime-local"), field(selected, "finish", "finish", "datetime-local"), field(selected, "percent", "percent", "number")), h("div", { className: "ap-plan-detail-read" }, h("div", null, h("span", null, `${t("resources")} · ${t("readonly")}`), selected.resources || "—"), h("div", null, h("span", null, `${t("predecessors")} · ${t("readonly")}`), (selected.predecessors || []).length ? selected.predecessors.map((link, index) => {
					const row = rowByUid.get(String(link.uid));
					return h("button", {
						key: index,
						type: "button",
						disabled: !row,
						title: row?.name || "",
						onClick: () => selectTask(row, true)
					}, `${row?.id ?? link.uid}${relationCode(link.type) || link.type || ""} ${link.lag || ""}`);
				}) : "—"), h("div", null, h("span", null, t("duration")), selected.duration || "—")), field(selected, "notes", "notes")) : h("div", { className: "ap-plan-help" }, t("select")) : null, h("div", { className: "ap-plan-footer" }, `${t("tasks")}: ${tasks.length}`, `${t("visible")}: ${visible.length}`, `${t("calendars")}: ${project.calendarCount || 0}`, Object.keys(edits).length ? `${t("changed")}: ${Object.keys(edits).length}${dirty ? " *" : ""}` : t("original"), control(t("reset"), () => {
					setHistory({
						past: [...history.past, edits],
						present: {},
						future: []
					});
					setStatus("");
				}, busy || !Object.keys(edits).length), t("manual"), h("span", { className: "ap-plan-legend" }, ...[
					"all",
					"critical",
					"milestone"
				].map((key) => h("span", { key }, h("i", { className: key }), t(key))))), h("details", { className: "ap-plan-help" }, h("summary", null, plan.engine || "MPXJ"), t("help")));
			};
		}
		//#endregion
		//#region src/client/file-preview-overlay.js
		function createFilePreviewOverlay(dependencies) {
			const { DocBtn, FileContextMenu, Icon, PREVIEW_HEAD_CHARS, PREVIEW_TABLE_ROW_CAP, React, ReactDOM, api, apiBlob, attachFolderPath, attachItemsOf, attachSessionId, buildPreviewSelectionFollowup, captureComposerFace, chooseAndUpload, chooseFolderForChat, codexTurnArmed, codexTurnListeners, currentDraft, dispatchToConversation, displayFileName, downloadBlob, escapeHtml, fileIconClass, fileIconName, fillComposer, fillMdTables, flattenFiles, foldAndSubmit, h, htmlToMarkdown, importWorkspaceFileToKb, looksLikeKbPackName, mdToHtml, mentionInChat, openInExplorer, previewIsHeavy, rawFileUrl, readDraft, readReasoningEffort, readWorkspaceCwd, replaceChildren, runtime, setCodexTurnArmed, showToast, slicePreviewMarkdown, snapshotComposer, snapshotFileList, sourceLabel, stitchMarkdown, stripComposerMentions, tAp, uploadFileList, useApLang, useAttachItems, wrapComposerSubmit } = dependencies;
			const ProjectPlanPreview = createProjectPlanPreview({
				React,
				api,
				Icon,
				useApLang
			});
			const PREVIEW_CACHE_MAX = 8;
			const previewCache = /* @__PURE__ */ new Map();
			function previewCacheKey(cwd, path, kbSlug) {
				return String(cwd || "") + "\0" + String(path || "") + "\0" + String(kbSlug || "");
			}
			function previewCacheGet(key) {
				if (!previewCache.has(key)) return null;
				const value = previewCache.get(key);
				previewCache.delete(key);
				previewCache.set(key, value);
				return value;
			}
			function previewCacheSet(key, value) {
				if (typeof value.text === "string" && value.text.length > 8e6) return;
				if (previewCache.has(key)) previewCache.delete(key);
				previewCache.set(key, value);
				while (previewCache.size > PREVIEW_CACHE_MAX) previewCache.delete(previewCache.keys().next().value);
			}
			function FilePreviewOverlay(props) {
				useApLang();
				const cwd = props.cwd;
				const file = props.file;
				const kbSlug = props.kbSlug || file && file.kbSlug || "";
				const kbHasSource = !!(props.kbHasSource || file && file.kbHasSource);
				const [loading, setLoading] = React.useState(true);
				const [error, setError] = React.useState("");
				const [status, setStatus] = React.useState("");
				const [kind, setKind] = React.useState("text");
				const [text, setText] = React.useState("");
				const [draft, setDraft] = React.useState("");
				const [mode, setMode] = React.useState("preview");
				const [sourceMode, setSourceMode] = React.useState(false);
				const [busy, setBusy] = React.useState("");
				const [copied, setCopied] = React.useState(false);
				const [cite, setCite] = React.useState(null);
				const [tablesReady, setTablesReady] = React.useState(true);
				const [office, setOffice] = React.useState(null);
				const [officeSaved, setOfficeSaved] = React.useState(null);
				const [siteUrl, setSiteUrl] = React.useState("");
				const [cadUrl, setCadUrl] = React.useState("");
				const [cadConversionStatus, setCadConversionStatus] = React.useState("");
				const [aiSel, setAiSel] = React.useState(null);
				const [sheetTab, setSheetTab] = React.useState(0);
				const [univerDirty, setUniverDirty] = React.useState(false);
				const [planEditState, setPlanEditState] = React.useState({
					dirty: false,
					busy: false
				});
				const closePreview = React.useCallback(() => {
					if (kind === "project-plan" && (planEditState.busy || planEditState.dirty && !window.confirm("关闭将丢弃尚未导出的计划编辑，是否继续？"))) return false;
					props.onClose();
					return true;
				}, [
					kind,
					planEditState,
					props.onClose
				]);
				const [recalcPrompt, setRecalcPrompt] = React.useState(null);
				const editRef = React.useRef(null);
				const wysiwygRef = React.useRef(null);
				const previewBoxRef = React.useRef(null);
				const univerRef = React.useRef(null);
				const cadRef = React.useRef(null);
				const fillCtl = React.useRef(null);
				const loadCtl = React.useRef(null);
				const fullMdRef = React.useRef("");
				const wysiwygTouched = React.useRef(false);
				const mdCtx = {
					cwd,
					filePath: file.path
				};
				const beginFill = (root, markdown, extra) => {
					if (fillCtl.current) fillCtl.current.cancel();
					if (!root) {
						setTablesReady(true);
						return;
					}
					setTablesReady(false);
					const ctl = fillMdTables(root, markdown, {
						cwd,
						filePath: file.path
					}, extra);
					fillCtl.current = ctl;
					ctl.done.then(() => {
						if (fillCtl.current !== ctl) return;
						setTablesReady(true);
						setStatus((s) => s === "正在展开表格…" || s === "正在渲染表格…" ? "" : s);
					}).catch(() => {
						if (fillCtl.current === ctl) setTablesReady(true);
					});
				};
				const openCitedFile = (path) => {
					if (!path) return;
					api("/api/agent-pi/citations", cwd, {
						method: "POST",
						body: JSON.stringify({
							path,
							filePath: file.path
						})
					}).then((body) => {
						if (!body.exists) return;
						if (body.insideWorkspace) window.dispatchEvent(new CustomEvent("agent-pi-open-file", { detail: {
							cwd,
							path: body.path
						} }));
						else openInExplorer(cwd, body.path, { reveal: true }).catch(() => {});
					}).catch(() => {});
				};
				const openCitation = (token) => {
					setCite({
						kind: "locator",
						token,
						loading: true
					});
					api("/api/agent-pi/citations", cwd, {
						method: "POST",
						body: JSON.stringify({
							action: "locator",
							token
						})
					}).then((body) => setCite({
						kind: "locator",
						token,
						data: body
					})).catch((e) => setCite({
						kind: "error",
						token,
						error: String(e.message || e)
					}));
				};
				const onPreviewClick = (event) => {
					const expand = event.target && event.target.closest ? event.target.closest("[data-md-expand]") : null;
					if (expand) {
						event.preventDefault();
						const wrap = expand.closest(".ap-doc-table-wrap") || expand.closest(".ap-doc-more") && expand.closest(".ap-doc-more").previousElementSibling;
						const idx = wrap && wrap.getAttribute ? Number(wrap.getAttribute("data-md-table")) : -1;
						beginFill(previewBoxRef.current || wysiwygRef.current, visible, {
							tableIndex: Number.isFinite(idx) ? idx : -1,
							batch: 200
						});
						setStatus("正在展开表格…");
						return;
					}
					const target = event.target && event.target.closest ? event.target.closest("[data-cite]") : null;
					if (!target) return;
					event.preventDefault();
					openCitation(target.getAttribute("data-cite") || "");
				};
				const excerptForAi = () => {
					if (mode === "edit" && !isOffice) {
						const el = editRef.current;
						if (el && typeof el.selectionStart === "number" && el.selectionStart !== el.selectionEnd) return String(el.value || "").slice(el.selectionStart, el.selectionEnd).trim();
						return String(draft || text || "").trim();
					}
					const sel = window.getSelection && window.getSelection();
					const live = sel ? String(sel.toString() || "").trim() : "";
					if (live.length >= 2) return live;
					if (isOffice && office) {
						if (kind === "spreadsheet" || kind === "legacy-office") {
							const sheet = (office.sheets || [])[sheetTab] || (office.sheets || [])[0];
							return (sheet && sheet.rows || []).slice(0, 40).map((row) => (row || []).slice(0, 12).join("	")).join("\n").trim();
						}
						if (kind === "word") return String((office.paragraphs || []).join("\n\n") || "").trim();
						return String((office.slides || []).map((slide) => (slide.texts || []).join("\n")).join("\n\n") || "").trim();
					}
					return String(visible || text || draft || "").trim();
				};
				const openAiSel = (raw) => {
					const picked = String(raw || excerptForAi() || "").trim();
					if (!picked) {
						setError("没有可改的文字。先选一段，或打开一份文本/表格。");
						return;
					}
					setAiSel({
						text: picked,
						instruction: "",
						sending: false
					});
				};
				const onPreviewMouseUp = (event) => {
					const field = event && event.target;
					if (field && typeof field.selectionStart === "number" && field.selectionStart !== field.selectionEnd) {
						const fromField = String(field.value || "").slice(field.selectionStart, field.selectionEnd).trim();
						if (fromField.length >= 2) {
							setAiSel({
								text: fromField,
								instruction: "",
								sending: false
							});
							return;
						}
					}
					const sel = window.getSelection && window.getSelection();
					const raw = sel ? String(sel.toString() || "").trim() : "";
					if (!raw || raw.length < 2) return;
					const root = event && event.currentTarget || previewBoxRef.current;
					if (root && sel.anchorNode && !root.contains(sel.anchorNode)) return;
					setAiSel({
						text: raw,
						instruction: "",
						sending: false
					});
				};
				React.useEffect(() => {
					let cancelled = false;
					if (loadCtl.current) loadCtl.current.abort();
					const ac = new AbortController();
					loadCtl.current = ac;
					setLoading(true);
					setError("");
					setStatus("");
					setMode("preview");
					setSourceMode(false);
					wysiwygTouched.current = false;
					fullMdRef.current = "";
					setOffice(null);
					setOfficeSaved(null);
					setUniverDirty(false);
					setSiteUrl("");
					setCadUrl("");
					setCadConversionStatus("");
					setAiSel(null);
					const cacheKey = previewCacheKey(cwd, file.path, kbSlug);
					const cached = previewCacheGet(cacheKey);
					const applyBody = (body) => {
						if (cancelled) return;
						if (kbSlug) {
							setKind("markdown");
							const next = body.text || "";
							setText(next);
							setDraft(next);
							fullMdRef.current = next;
							wysiwygTouched.current = false;
							setMode("preview");
							setSourceMode(false);
							setLoading(false);
							return;
						}
						const nextKind = body.kind || (body.binary ? "binary" : "text");
						setKind(nextKind);
						setSiteUrl(body.siteUrl || "");
						setCadUrl(body.viewerUrl || "");
						if (nextKind === "spreadsheet" || nextKind === "word" || nextKind === "slides" || nextKind === "legacy-office") {
							setOffice(body);
							setOfficeSaved(body);
							setSheetTab(0);
							setText("");
							setDraft("");
							if (body.engine === "univer-office" && body.hint) setStatus(body.hint);
							setLoading(false);
							return;
						}
						if (body.binary && !body.text && (nextKind === "markdown" || nextKind === "text")) {
							setKind("binary");
							setError("文件约 " + Math.round((body.size || 0) / 1024) + " KB，超出预览上限。");
							setText("");
							setDraft("");
						} else {
							const next = body.text || "";
							setText(next);
							setDraft(next);
							fullMdRef.current = next;
							wysiwygTouched.current = false;
							if (nextKind === "markdown") {
								setMode("preview");
								setSourceMode(false);
							}
						}
						setLoading(false);
					};
					if (cached) {
						applyBody(cached);
						return () => {
							cancelled = true;
							ac.abort();
						};
					}
					(kbSlug ? api("/api/agent-pi/kb/content?slug=" + encodeURIComponent(kbSlug), cwd, {
						method: "GET",
						signal: ac.signal,
						timeoutMs: 45e3
					}) : api("/api/agent-pi/files/content?path=" + encodeURIComponent(file.path), cwd, {
						method: "GET",
						signal: ac.signal,
						timeoutMs: 12e4
					})).then((body) => {
						previewCacheSet(cacheKey, body);
						applyBody(body);
					}).catch((e) => {
						if (cancelled || e && e.name === "AbortError") return;
						setError(String(e.message || e));
						setLoading(false);
					});
					return () => {
						cancelled = true;
						ac.abort();
						if (fillCtl.current) fillCtl.current.cancel();
					};
				}, [
					cwd,
					file.path,
					kbSlug
				]);
				const isOffice = kind === "spreadsheet" || kind === "word" || kind === "slides" || kind === "legacy-office";
				const isCad = kind === "cad";
				const isOfficeUniver = !!(isOffice && office && office.engine === "univer-office" && office.viewerUrl);
				const isSlimUniver = !!(kind === "spreadsheet" && office && office.engine === "univer" && office.viewerUrl);
				const isUniver = !!(isOfficeUniver || isSlimUniver);
				React.useEffect(() => {
					if (!isCad) return void 0;
					const onMessage = (event) => {
						if (event.origin !== window.location.origin || !cadRef.current || event.source !== cadRef.current.contentWindow) return;
						const message = event.data || {};
						if (message.type === "agent-pi-cad:ready") {
							setStatus("二维预览已就绪");
							setError("");
						} else if (message.type === "agent-pi-cad:error") setError(String(message.message || "CAD 预览失败，请用系统 CAD 应用打开。"));
						else if (message.type === "agent-pi-cad:open-external") openInExplorer(cwd, file.path, {
							file,
							reveal: false
						}).catch((err) => setError(String(err && err.message || err)));
					};
					window.addEventListener("message", onMessage);
					return () => window.removeEventListener("message", onMessage);
				}, [
					isCad,
					cwd,
					file.path
				]);
				React.useEffect(() => {
					if (!isCad || !/\.dwg$/i.test(file.path || "")) return void 0;
					let cancelled = false;
					api("/api/agent-pi/cad/convert", cwd, {
						method: "POST",
						body: JSON.stringify({ path: file.path }),
						timeoutMs: 2e5
					}).then((result) => {
						if (!cancelled) setCadConversionStatus("已生成供智能体读图的 DXF：" + result.relativePath);
					}).catch((error) => {
						if (!cancelled) setCadConversionStatus(String(error.message || error));
					});
					return () => {
						cancelled = true;
					};
				}, [
					isCad,
					cwd,
					file.path
				]);
				const canEdit = kbSlug ? kind === "markdown" || kind === "text" : (kind === "markdown" || kind === "text") && /\.(md|markdown|txt)$/i.test(file.path || file.name || "") || isOffice && office && office.editable;
				const canExport = kind === "markdown" || kind === "text";
				const heavy = kind === "markdown" && mode === "edit" && previewIsHeavy(draft);
				const isWysiwyg = canEdit && kind === "markdown" && mode === "edit" && !sourceMode;
				const visible = mode === "edit" ? draft : draft || text;
				const previewSource = mode === "edit" ? slicePreviewMarkdown(visible).text : visible;
				const officeDirty = !!(isOffice && office && officeSaved && JSON.stringify(office) !== JSON.stringify(officeSaved));
				const dirty = canEdit && (isUniver ? univerDirty : isOffice ? officeDirty : draft !== text);
				const previewHtml = React.useMemo(() => {
					if (kind !== "markdown") return "";
					try {
						return mdToHtml(previewSource, {
							cwd,
							filePath: file.path,
							tableRowCap: mode === "edit" ? PREVIEW_TABLE_ROW_CAP : Number.POSITIVE_INFINITY
						});
					} catch (err) {
						return "<p class=\"ap-err\">预览生成失败，请用源码查看。</p>";
					}
				}, [
					kind,
					mode,
					previewSource,
					cwd,
					file.path
				]);
				const markdownFromWysiwyg = () => {
					if (!wysiwygRef.current) return fullMdRef.current || draft;
					return stitchMarkdown(htmlToMarkdown(wysiwygRef.current), fullMdRef.current || text || draft);
				};
				const syncFromWysiwyg = () => {
					if (!wysiwygRef.current || !tablesReady) return draft;
					const next = markdownFromWysiwyg();
					fullMdRef.current = next;
					setDraft(next);
					return next;
				};
				const currentMarkdown = () => {
					if (isWysiwyg && wysiwygRef.current && tablesReady && wysiwygTouched.current) return markdownFromWysiwyg();
					return mode === "edit" ? fullMdRef.current || draft : fullMdRef.current || draft || text;
				};
				React.useLayoutEffect(() => {
					if (kind !== "markdown") return void 0;
					if (isWysiwyg && wysiwygRef.current && !wysiwygTouched.current) {
						try {
							wysiwygRef.current.innerHTML = mdToHtml(slicePreviewMarkdown(fullMdRef.current || draft).text, Object.assign({}, mdCtx, { tableRowCap: PREVIEW_TABLE_ROW_CAP }));
						} catch (err) {
							wysiwygRef.current.innerHTML = "<p class=\"ap-err\">预览生成失败，请用源码查看。</p>";
						}
						return () => {
							if (fillCtl.current) fillCtl.current.cancel();
						};
					}
					return () => {
						if (fillCtl.current) fillCtl.current.cancel();
					};
				}, [
					mode,
					sourceMode,
					file.path,
					kind,
					loading
				]);
				const copyAll = () => {
					const value = currentMarkdown();
					if (!value) return;
					navigator.clipboard.writeText(value).then(() => {
						setCopied(true);
						setTimeout(() => setCopied(false), 1600);
					}).catch(() => {});
				};
				const persistMarkdown = (next, recalculate) => {
					setBusy("save");
					setError("");
					(kbSlug ? api("/api/agent-pi/kb", cwd, {
						method: "POST",
						body: JSON.stringify({
							action: "save-content",
							slug: kbSlug,
							text: next
						})
					}) : api("/api/agent-pi/files/save", cwd, {
						method: "POST",
						body: JSON.stringify({
							path: file.path,
							content: next,
							recalculate: !!recalculate
						})
					})).then((body) => {
						setDraft(next);
						setText(next);
						previewCacheSet(previewCacheKey(cwd, file.path, kbSlug), Object.assign({}, body, {
							text: next,
							kind
						}));
						const review = body && body.pricingReview;
						setStatus(kbSlug ? "已保存并重建该条知识库" : review && review.applied && review.deferred === "no_pack" ? "已保存：已记入本标人工复核，组价包生成后自动套用" : review && review.applied && review.workbook ? "已保存：已记入本标人工复核，并按新工效/单价重算数量，测算表已重生" : review && review.applied ? "已保存：已记入本标人工复核，并按新工效/单价重算相关数量" : body && body.kbSidecar ? "已保存并同步知识库检索" : body && (body.packSidecar || body.reportSidecar) ? "已保存并同步解析 JSON" : "已保存");
						if (kbSlug && typeof props.onKbSaved === "function") props.onKbSaved();
						else window.dispatchEvent(new Event("agent-pi-files-changed"));
					}).catch((e) => setError(String(e.message || e))).finally(() => setBusy(""));
				};
				const saveContent = (content, memoryConfirmed) => {
					if (!canEdit || busy) return;
					if (isOfficeUniver) return;
					if (!kbSlug && !memoryConfirmed) {
						setBusy("memory-impact");
						setError("");
						api("/api/agent-pi/memory/impact", cwd, {
							method: "POST",
							body: JSON.stringify({ path: file.path })
						}).then((impact) => {
							if (impact && impact.affected) {
								const labels = (impact.stageLabels || impact.stageIds || []).join("、");
								const approval = impact.requiresReapproval ? "，并需要重新人工确认相关冻结门" : "";
								if (!window.confirm("这份文件属于「" + (impact.sourceStageLabel || impact.sourceStageId) + "」的已冻结基线。\n\n保存后将使以下阶段失效：" + labels + approval + "。\n\n仍要保存吗？")) {
									setBusy("");
									return;
								}
							}
							setBusy("");
							saveContent(content, true);
						}).catch((e) => {
							setBusy("");
							setError("无法核对阶段基线影响，已取消保存：" + String(e.message || e));
						});
						return;
					}
					if (isSlimUniver) {
						if (!univerDirty) return;
						setBusy("save");
						setError("");
						const frame = univerRef.current;
						if (frame && frame.contentWindow) frame.contentWindow.postMessage({
							type: "ap-univer",
							action: "save"
						}, "*");
						else {
							setBusy("");
							setError("表格还没打开");
						}
						return;
					}
					if (isOffice) {
						if (!officeDirty) return;
						setBusy("save");
						setError("");
						api("/api/agent-pi/files/save", cwd, {
							method: "POST",
							body: JSON.stringify({
								path: file.path,
								office: {
									kind: office.kind,
									sheets: office.sheets,
									paragraphs: office.paragraphs,
									slides: office.slides
								}
							})
						}).then((body) => {
							setOfficeSaved(office);
							setStatus(body && body.hint || "已保存");
							previewCache.delete(previewCacheKey(cwd, file.path, ""));
							window.dispatchEvent(new Event("agent-pi-files-changed"));
						}).catch((e) => setError(String(e.message || e))).finally(() => setBusy(""));
						return;
					}
					const next = content == null ? currentMarkdown() : content;
					if (next === text) return;
					if (!kbSlug && /(?:^|\/)boq-pricing\/.+\.md$/i.test(String(file.path || "").replace(/\\/g, "/"))) {
						setBusy("save");
						setError("");
						api("/api/agent-pi/pricing/sensitive-diff", cwd, {
							method: "POST",
							body: JSON.stringify({
								path: file.path,
								content: next,
								previous: text
							})
						}).then((body) => {
							if (!body || !body.hasSensitive) {
								persistMarkdown(next, false);
								return;
							}
							setBusy("");
							setRecalcPrompt({
								next,
								changes: body.changes || []
							});
						}).catch((e) => {
							setBusy("");
							setError(String(e.message || e));
						});
						return;
					}
					persistMarkdown(next, false);
				};
				const save = () => saveContent();
				React.useEffect(() => {
					const onKey = (event) => {
						if (event.key === "Escape") {
							if (aiSel) {
								setAiSel(null);
								return;
							}
							closePreview();
						}
						if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
							event.preventDefault();
							saveContent();
						}
					};
					window.addEventListener("keydown", onKey);
					return () => window.removeEventListener("keydown", onKey);
				}, [
					closePreview,
					canEdit,
					busy,
					cwd,
					file.path,
					draft,
					text,
					mode,
					sourceMode,
					aiSel,
					office,
					officeSaved,
					univerDirty
				]);
				React.useEffect(() => {
					const onMsg = (event) => {
						const data = event && event.data;
						if (!data || data.type !== "ap-univer") return;
						if (data.event === "dirty") setUniverDirty(true);
						if (data.event === "ready") {
							const names = Array.isArray(data.sheets) ? data.sheets.filter(Boolean) : [];
							setStatus(names.length ? "共 " + names.length + " 张表：" + names.join(" / ") + "。底部切表，保存写回原文件。图表请用对话完全体。" : "可改格子、底部切表，保存写回原文件");
						}
						if (data.event === "saved") {
							setUniverDirty(false);
							setStatus(data.hint || "已保存回原文件");
							setBusy("");
							previewCache.delete(previewCacheKey(cwd, file.path, ""));
							window.dispatchEvent(new Event("agent-pi-files-changed"));
						}
						if (data.event === "error") {
							setError(data.message || "Univer 保存失败");
							setBusy("");
						}
					};
					window.addEventListener("message", onMsg);
					return () => window.removeEventListener("message", onMsg);
				}, [cwd, file.path]);
				const applyEdit = (mutator) => {
					const el = editRef.current;
					const next = mutator(draft, el ? el.selectionStart : draft.length, el ? el.selectionEnd : draft.length);
					setDraft(next.value);
					requestAnimationFrame(() => {
						if (!editRef.current) return;
						editRef.current.focus();
						editRef.current.setSelectionRange(next.start, next.end);
					});
				};
				const wrapSel = (before, after) => applyEdit((value, start, end) => {
					const selected = value.slice(start, end) || "文本";
					return {
						value: value.slice(0, start) + before + selected + after + value.slice(end),
						start: start + before.length,
						end: start + before.length + selected.length
					};
				});
				const prefixLines = (prefix) => applyEdit((value, start, end) => {
					const from = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
					const nextBlock = value.slice(from, end).split("\n").map((line) => prefix + line.replace(/^#{1,6}\s+/, "").replace(/^\s*[-*+]\s+/, "").replace(/^\s*\d+\.\s+/, "").replace(/^\s*>\s?/, "")).join("\n");
					return {
						value: value.slice(0, from) + nextBlock + value.slice(end),
						start: from,
						end: from + nextBlock.length
					};
				});
				const runWysiwyg = (command, value) => {
					if (!wysiwygRef.current) return;
					wysiwygRef.current.focus();
					document.execCommand(command, false, value);
					wysiwygTouched.current = true;
					syncFromWysiwyg();
				};
				const insertWysiwygHtml = (html) => {
					if (!wysiwygRef.current) return;
					wysiwygRef.current.focus();
					document.execCommand("insertHTML", false, html);
					wysiwygTouched.current = true;
					syncFromWysiwyg();
				};
				const format = (kindBtn) => {
					if (!isWysiwyg) {
						if (kindBtn === "h1") return prefixLines("# ");
						if (kindBtn === "h2") return prefixLines("## ");
						if (kindBtn === "h3") return prefixLines("### ");
						if (kindBtn === "b") return wrapSel("**", "**");
						if (kindBtn === "i") return wrapSel("*", "*");
						if (kindBtn === "ul") return prefixLines("- ");
						if (kindBtn === "ol") return prefixLines("1. ");
						if (kindBtn === "quote") return prefixLines("> ");
						if (kindBtn === "code") return wrapSel("```\n", "\n```");
						if (kindBtn === "table") return applyEdit((value, start) => {
							return {
								value: value.slice(0, start) + "\n\n| 列 1 | 列 2 |\n| --- | --- |\n|  |  |\n\n" + value.slice(start),
								start: start + 39,
								end: start + 39
							};
						});
						return;
					}
					if (kindBtn === "h1") return runWysiwyg("formatBlock", "h1");
					if (kindBtn === "h2") return runWysiwyg("formatBlock", "h2");
					if (kindBtn === "h3") return runWysiwyg("formatBlock", "h3");
					if (kindBtn === "b") return runWysiwyg("bold");
					if (kindBtn === "i") return runWysiwyg("italic");
					if (kindBtn === "ul") return runWysiwyg("insertUnorderedList");
					if (kindBtn === "ol") return runWysiwyg("insertOrderedList");
					if (kindBtn === "quote") return runWysiwyg("formatBlock", "blockquote");
					if (kindBtn === "code") return insertWysiwygHtml("<pre><code>" + escapeHtml(window.getSelection() && window.getSelection().toString() || "code") + "</code></pre>");
					if (kindBtn === "table") return insertWysiwygHtml("<table><thead><tr><th>列 1</th><th>列 2</th></tr></thead><tbody><tr><td></td><td></td></tr></tbody></table>");
				};
				const toggleMode = () => {
					if (mode === "edit") {
						const next = currentMarkdown();
						fullMdRef.current = next;
						setDraft(next);
						setMode("preview");
						setSourceMode(false);
					} else {
						setMode("edit");
						setSourceMode(false);
					}
				};
				const toggleSource = () => {
					if (isWysiwyg) {
						const next = currentMarkdown();
						fullMdRef.current = next;
						setDraft(next);
					} else wysiwygTouched.current = false;
					setSourceMode(!sourceMode);
				};
				const asPdfBytes = (bytes) => {
					if (bytes instanceof Uint8Array) return bytes;
					if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
					if (bytes && bytes.type === "Buffer" && Array.isArray(bytes.data)) return new Uint8Array(bytes.data);
					if (bytes && typeof bytes.length === "number") return new Uint8Array(bytes);
					throw new Error("PDF 导出返回了无法识别的数据");
				};
				const exportFile = (formatName) => {
					if (!canExport || busy) return;
					const content = currentMarkdown();
					setBusy(formatName);
					setError("");
					setStatus(formatName === "pdf" ? "正在排版 PDF…" : formatName === "docx" ? "正在生成 Word…" : "正在导出 Markdown…");
					const desktopPdf = formatName === "pdf" && window.agentPiDesktop && typeof window.agentPiDesktop.printToPdf === "function";
					const requestExport = (format) => apiBlob("/api/agent-pi/files/export", cwd, {
						method: "POST",
						body: JSON.stringify({
							path: file.path,
							format,
							content
						})
					});
					const run = async () => {
						if (desktopPdf) try {
							const prepared = await requestExport("html");
							const html = await prepared.blob.text();
							const bytes = asPdfBytes(await window.agentPiDesktop.printToPdf(html));
							const filename = String(prepared.filename || file.name).replace(/\.html$/i, ".pdf");
							downloadBlob(new Blob([bytes], { type: "application/pdf" }), filename);
							setStatus("已下载 " + filename);
							return;
						} catch {
							setStatus("桌面排版未完成，改用服务端导出…");
						}
						const result = await requestExport(formatName);
						downloadBlob(result.blob, result.filename);
						setStatus("已下载 " + result.filename);
					};
					run().catch((e) => {
						setStatus("");
						setError(String(e.message || e));
					}).finally(() => setBusy(""));
				};
				const remove = () => {
					if (busy || kind === "project-plan" && planEditState.busy) return;
					if (!window.confirm("删除文件「" + file.name + "」？此操作无法撤销。")) return;
					setBusy("delete");
					api("/api/agent-pi/memory/impact", cwd, {
						method: "POST",
						body: JSON.stringify({ path: file.path })
					}).then((impact) => {
						if (impact && impact.affected) {
							const labels = (impact.stageLabels || impact.stageIds || []).join("、");
							if (!window.confirm("删除这份冻结成果会使以下阶段失效：" + labels + "。\n\n仍要删除吗？")) return null;
						}
						return api("/api/agent-pi/files/delete", cwd, {
							method: "POST",
							body: JSON.stringify({ path: file.path })
						});
					}).then((deleted) => {
						if (deleted === null) return;
						window.dispatchEvent(new Event("agent-pi-files-changed"));
						if (typeof props.onDeleted === "function") props.onDeleted();
						else props.onClose();
					}).catch((e) => setError(String(e.message || e))).finally(() => setBusy(""));
				};
				const sendAiSel = () => {
					if (!aiSel || !aiSel.instruction || !aiSel.instruction.trim() || aiSel.sending) return;
					setAiSel(Object.assign({}, aiSel, { sending: true }));
					let followup;
					try {
						followup = buildPreviewSelectionFollowup({
							filePath: file.path,
							selectedText: aiSel.text,
							instruction: aiSel.instruction
						});
					} catch (err) {
						setError(String(err.message || err));
						setAiSel(null);
						return;
					}
					mentionInChat(props.sessionProps || props, file);
					dispatchToConversation(props.sessionProps || props, followup).then(() => {
						setStatus("已把选区修改发回主对话");
						setAiSel(null);
					}).catch((e) => {
						setError(String(e.message || e));
						setAiSel(Object.assign({}, aiSel, { sending: false }));
					});
				};
				const openUniver = () => {
					const text = "请用 univer_import 打开这个文件，在对话里按项目记忆继续改，改完保存回原路径：\n" + file.path;
					mentionInChat(props.sessionProps || props, file);
					dispatchToConversation(props.sessionProps || props, text).then(() => setStatus("已请主对话用 Univer 打开此表")).catch((e) => setError(String(e.message || e)));
				};
				const updateSheetCell = (sheetIndex, r, c, value) => {
					setOffice((prev) => {
						if (!prev || !prev.sheets) return prev;
						const sheets = prev.sheets.map((sheet, i) => {
							if (i !== sheetIndex) return sheet;
							const rows = sheet.rows.map((row) => row.slice());
							while (rows.length <= r) rows.push([]);
							while (rows[r].length <= c) rows[r].push("");
							rows[r][c] = value;
							return Object.assign({}, sheet, { rows });
						});
						return Object.assign({}, prev, { sheets });
					});
				};
				const renderOffice = () => {
					if (!office) return h("div", { className: "ap-doc-status" }, "正在读取 Office 文件…");
					if (kind === "legacy-office") return h("div", null, h("p", { className: "ap-doc-hint" }, office.hint || "旧版 OLE 文件不能在预览里保存。"), DocBtn("用 Univer 打开", openUniver, [Icon("sparkles", 14), "用 Univer 打开"]));
					if (kind === "spreadsheet") {
						const sheets = office.sheets || [];
						const sheet = sheets[sheetTab] || sheets[0] || {
							name: "Sheet1",
							rows: [[""]]
						};
						const rows = sheet.rows && sheet.rows.length ? sheet.rows : [[""]];
						const cols = rows.reduce((max, row) => Math.max(max, row.length), 1);
						return h("div", { onMouseUp: onPreviewMouseUp }, h("p", { className: "ap-doc-hint" }, office.hint || (mode === "edit" ? "改格子后 Ctrl+S 保存。" : "预览数值表。复杂公式请用 Univer。")), h("div", {
							className: "ap-row",
							style: { marginBottom: 8 }
						}, sheets.map((item, i) => h("button", {
							key: item.name + i,
							type: "button",
							className: "ap-doc-btn" + (i === sheetTab ? " on" : ""),
							onClick: () => setSheetTab(i)
						}, item.name || "Sheet " + (i + 1)))), h("div", { className: "ap-sheet" }, h("table", null, h("tbody", null, rows.map((row, r) => h("tr", { key: r }, Array.from({ length: cols }, (_, c) => h("td", { key: c }, mode === "edit" ? h("input", {
							value: row[c] || "",
							onChange: (event) => updateSheetCell(sheetTab, r, c, event.target.value)
						}) : row[c] || ""))))))));
					}
					if (kind === "word") {
						const paras = office.paragraphs || [""];
						return h("div", { onMouseUp: onPreviewMouseUp }, h("p", { className: "ap-doc-hint" }, office.hint || "改段落文字后保存。"), mode === "edit" ? h("textarea", {
							className: "ap-doc-edit",
							value: paras.join("\n\n"),
							onChange: (event) => setOffice(Object.assign({}, office, { paragraphs: event.target.value.split(/\n\n/) }))
						}) : paras.map((line, i) => h("p", { key: i }, line || "\xA0")));
					}
					const slides = office.slides || [];
					return h("div", { onMouseUp: onPreviewMouseUp }, h("p", { className: "ap-doc-hint" }, office.hint || "改每页已有文本框。"), slides.map((slide, i) => h("div", {
						key: i,
						className: "ap-slide"
					}, h("strong", null, slide.name || "幻灯片 " + (i + 1)), (slide.texts || []).map((line, j) => mode === "edit" ? h("input", {
						key: j,
						value: line,
						onChange: (event) => {
							const next = (office.slides || []).map((item, si) => {
								if (si !== i) return item;
								const texts = (item.texts || []).slice();
								texts[j] = event.target.value;
								return Object.assign({}, item, { texts });
							});
							setOffice(Object.assign({}, office, { slides: next }));
						}
					}) : h("p", { key: j }, line)))));
				};
				let body = null;
				if (loading) body = h("div", { className: "ap-doc-status" }, "正在打开文件…");
				else if (kind === "project-plan") body = h(ProjectPlanPreview, {
					key: file.path,
					cwd,
					path: file.path,
					onEditState: setPlanEditState
				});
				else if (kind === "image") body = h("img", {
					className: "ap-doc-img",
					src: rawFileUrl(cwd, file.path),
					alt: file.name
				});
				else if (kind === "pdf") body = h("iframe", {
					className: "ap-doc-frame",
					title: file.name,
					src: rawFileUrl(cwd, file.path)
				});
				else if (kind === "html") body = h("iframe", {
					className: "ap-doc-frame",
					title: file.name,
					src: siteUrl || rawFileUrl(cwd, file.path),
					sandbox: "allow-same-origin allow-scripts allow-forms allow-popups"
				});
				else if (isCad) body = cadUrl ? h("iframe", {
					ref: cadRef,
					className: "ap-cad-frame",
					title: file.name,
					src: cadUrl,
					sandbox: "allow-same-origin allow-scripts"
				}) : h("div", { className: "ap-doc-status" }, "二维 CAD 预览资源尚未就绪。");
				else if (isUniver) {
					const viewerUrl = scopeUniverViewerUrl(office.viewerUrl, attachSessionId(props.sessionProps || props));
					body = viewerUrl ? h("iframe", {
						ref: univerRef,
						className: "ap-univer-frame",
						title: file.name,
						src: viewerUrl,
						allow: "clipboard-read; clipboard-write; fullscreen"
					}) : h("div", { className: "ap-doc-status" }, tAp("请先打开或创建一个对话，再预览 Office 文件。", "Open or create a conversation before previewing Office files."));
				} else if (isOffice) body = renderOffice();
				else if (kind === "binary") body = h("div", { className: "ap-doc-status" }, "二进制文件无法在预览中排版。可用右上角下载原件，或右键加入对话后让智能体读取。");
				else if (canEdit && mode === "edit" && !isOffice) body = h("div", null, h("p", { className: "ap-doc-hint" }, dirty ? kbSlug ? "未保存 · Ctrl+S 覆盖解析稿并重建知识库" : "未保存 · Ctrl+S 写回源文件" : sourceMode ? "源码模式。切回所见即所得后继续排版。" : tablesReady ? kbSlug ? "改的是解析稿 Markdown，不是源 PDF/Word。Ctrl+S 保存后重建该条。" : heavy ? "文档较大，所见即所得只渲染前 " + PREVIEW_HEAD_CHARS + " 字和大表前 " + PREVIEW_TABLE_ROW_CAP + " 行。保存时会把未显示部分拼回原文件。" : "直接在文档里改字，工具栏改标题/列表。Ctrl+S 保存。" : "正在渲染表格，完成后即可直接改。"), h("div", { className: "ap-doc-toolbar" }, DocBtn("一级标题", () => format("h1"), "H1"), DocBtn("二级标题", () => format("h2"), "H2"), DocBtn("三级标题", () => format("h3"), "H3"), DocBtn("粗体", () => format("b"), "B"), DocBtn("斜体", () => format("i"), "I"), DocBtn("无序列表", () => format("ul"), "列表"), DocBtn("有序列表", () => format("ol"), "编号"), DocBtn("引用", () => format("quote"), "引用"), DocBtn("代码块", () => format("code"), "代码"), DocBtn("表格", () => format("table"), "表格"), kind === "markdown" ? h("button", {
					type: "button",
					className: "ap-doc-btn" + (sourceMode ? " on" : ""),
					title: sourceMode ? "所见即所得" : "Markdown 源码",
					onClick: toggleSource
				}, sourceMode ? "排版" : "源码") : null), kind === "markdown" && !sourceMode ? h("div", {
					ref: wysiwygRef,
					className: "ap-doc-wysiwyg",
					contentEditable: tablesReady,
					suppressContentEditableWarning: true,
					spellCheck: false,
					onInput: () => {
						wysiwygTouched.current = true;
						syncFromWysiwyg();
						setStatus("");
					},
					onMouseUp: onPreviewMouseUp
				}) : h("textarea", {
					ref: editRef,
					className: "ap-doc-edit",
					value: draft,
					spellCheck: false,
					onChange: (event) => {
						fullMdRef.current = event.target.value;
						setDraft(event.target.value);
						setStatus("");
					},
					onMouseUp: onPreviewMouseUp
				}));
				else if (kind === "markdown") body = h("div", null, h("div", {
					ref: previewBoxRef,
					onClick: onPreviewClick,
					onMouseUp: onPreviewMouseUp,
					dangerouslySetInnerHTML: { __html: previewHtml }
				}));
				else body = h("pre", {
					style: {
						whiteSpace: "pre-wrap",
						margin: 0,
						font: "var(--dsw-font-markdown-code-block-small)"
					},
					onMouseUp: onPreviewMouseUp
				}, visible);
				return h("div", {
					className: "ap-doc",
					role: "dialog",
					"aria-modal": "true",
					"aria-label": file.name
				}, h("div", { className: "ap-doc-hd" }, h("div", {
					className: "ap-doc-path",
					title: kbSlug ? file.name + " · 解析稿" : file.path
				}, kbSlug ? (file.name || kbSlug) + " · 解析稿" : file.path), h("div", { className: "ap-doc-actions" }, kbSlug ? null : DocBtn(tAp("files.attachToChat"), () => {
					if (kind === "project-plan" && !closePreview()) return;
					mentionInChat(props.sessionProps || props, file);
					if (kind !== "project-plan" && typeof props.onClose === "function") props.onClose();
				}, [Icon("paperclip", 14), tAp("files.attachToChat")], loading), isCad || kind === "project-plan" ? null : DocBtn(tAp("preview.aiEdit"), () => openAiSel(), [Icon("sparkles", 14), tAp("preview.aiEdit")], loading || !!busy), canEdit && !isUniver ? DocBtn(mode === "edit" ? "预览" : "编辑", toggleMode, [Icon(mode === "edit" ? "eye" : "pencil", 14)], loading) : null, canEdit && !isOfficeUniver ? DocBtn("保存", save, [Icon("save", 14)], loading || !dirty || !!busy) : null, isOffice && !isOfficeUniver ? DocBtn(isSlimUniver ? "对话完全体" : "用 Univer 打开", openUniver, [Icon("sparkles", 14), isSlimUniver ? "对话完全体" : "Univer"], loading || !!busy) : null, canExport ? DocBtn(copied ? "已复制" : "复制全文", copyAll, [Icon("copy", 14)], loading || !visible) : null, kbSlug && kbHasSource ? DocBtn("打开源文件", () => {
					api("/api/agent-pi/kb", cwd, {
						method: "POST",
						body: JSON.stringify({
							action: "open-source",
							slug: kbSlug
						})
					}).catch((e) => setError(String(e.message || e)));
				}, [Icon("folder", 14), "打开源文件"], !!busy) : null, kbSlug ? null : DocBtn("删除", remove, [Icon("trash", 14)], !!busy), isCad ? DocBtn("系统打开", () => {
					openInExplorer(cwd, file.path, {
						file,
						reveal: false
					}).catch((err) => setError(String(err && err.message || err)));
				}, [Icon("folder", 14), "系统打开"], loading || !!busy) : null, kbSlug ? null : canExport ? h("div", { className: "ap-doc-exports" }, DocBtn("导出 Markdown", () => exportFile("md"), [Icon("download", 14), " MD"], !!busy), DocBtn("导出 PDF", () => exportFile("pdf"), [Icon("download", 14), " PDF"], !!busy), DocBtn("导出 Word", () => exportFile("docx"), [Icon("download", 14), " DOCX"], !!busy)) : null, kind === "binary" || kind === "pdf" || kind === "image" || isOffice || kind === "html" || isCad || kind === "project-plan" ? DocBtn("下载原件", () => {
					apiBlob("/api/agent-pi/files/raw?path=" + encodeURIComponent(file.path), cwd, { method: "GET" }).then((result) => downloadBlob(result.blob, result.filename || file.name)).catch((e) => setError(String(e.message || e)));
				}, [Icon("download", 14)], !!busy) : null, DocBtn("关闭", closePreview, [Icon("x", 14)]))), h("div", { className: "ap-doc-scroll" + (isUniver ? " univer" : isCad ? " cad" : kind === "project-plan" ? " plan" : "") }, isUniver || isCad || kind === "project-plan" ? h(React.Fragment, null, error ? h("div", {
					className: "ap-err",
					style: {
						padding: "8px 12px",
						position: "relative",
						zIndex: 2
					}
				}, error) : null, isCad && cadConversionStatus ? h("div", {
					className: "ap-doc-status",
					style: {
						padding: "8px 12px",
						position: "relative",
						zIndex: 2
					}
				}, cadConversionStatus) : null, (!isOfficeUniver && !isCad || isCad && error) && status ? h("div", {
					className: "ap-doc-status",
					style: {
						padding: "8px 12px",
						position: "relative",
						zIndex: 2
					}
				}, status) : null, body) : kind === "pdf" || kind === "html" ? body : h("div", { className: "ap-doc-sheet" + (mode === "edit" && sourceMode ? " wide" : "") }, error ? h("div", { className: "ap-err" }, error) : null, status ? h("div", { className: "ap-doc-status" }, status) : null, body)), cite ? h("div", { className: "ap-cite-pop" }, h("div", { className: "ap-cite-pop-hd" }, Icon(cite.data && cite.data.kind === "kb" ? "book" : "file", 14), h("strong", { title: cite.token }, cite.data && cite.data.label ? cite.data.label : cite.token), h("button", {
					type: "button",
					className: "ap-doc-btn",
					onClick: () => setCite(null)
				}, Icon("x", 12))), h("div", { className: "ap-cite-pop-bd" }, cite.loading ? "加载中…" : cite.kind === "error" ? h("span", { className: "ap-err" }, cite.error) : cite.data ? h(React.Fragment, null, cite.data.exists === false ? h("p", { className: "ap-err" }, "找不到该出处") : null, cite.data.source ? h("p", null, "源文件：" + cite.data.source) : null, cite.data.page ? h("p", null, "页：第 " + cite.data.page + " 页") : cite.data.lineStart ? h("p", null, "行：L" + cite.data.lineStart + (cite.data.lineEnd && cite.data.lineEnd !== cite.data.lineStart ? "–L" + cite.data.lineEnd : "")) : null, cite.data.heading ? h("p", null, "题目 / 段落：" + cite.data.heading) : null, cite.data.clause ? h("p", { className: "crumb" }, "条款 " + cite.data.clause) : null, cite.data.path ? h("p", null, h("button", {
					type: "button",
					className: "ap-doc-btn",
					onClick: () => openCitedFile(cite.data.path)
				}, "打开源文件")) : null) : null)) : null, recalcPrompt ? h("div", {
					className: "ap-overlay",
					"data-ap-recalc-confirm": "1",
					onClick: (event) => {
						if (event.target === event.currentTarget) setRecalcPrompt(null);
					}
				}, h("div", { className: "ap-modal wide" }, h("h1", null, "确认人工复核并全局调整"), h("p", { className: "hint" }, "这些是本标人工复核准确数。确定后写入项目复核库，并按新工效、单价重算相关资源数量与金额。取消则不保存。"), h("ul", { style: {
					paddingLeft: 18,
					margin: "8px 0 16px"
				} }, (recalcPrompt.changes || []).map((row, index) => h("li", { key: row.key || index }, (row.kind === "productivity" ? "工效" : "单价") + " · " + row.label + (row.itemHint ? "（" + row.itemHint + "）" : "") + "：" + row.from + " → " + row.to + (row.unit ? " " + row.unit : "")))), h("div", { className: "ap-foot" }, h("button", {
					type: "button",
					className: "ap-btn",
					onClick: () => setRecalcPrompt(null)
				}, "取消"), h("button", {
					type: "button",
					className: "ap-btn primary",
					onClick: () => {
						const next = recalcPrompt.next;
						setRecalcPrompt(null);
						persistMarkdown(next, true);
					}
				}, "确认并全局调整")))) : null, aiSel ? h("div", {
					className: "ap-ai-sel",
					onMouseDown: (event) => {
						if (event.target === event.currentTarget) setAiSel(null);
					}
				}, h("div", {
					className: "ap-ai-sel-card",
					role: "dialog",
					"aria-label": tAp("preview.aiEditSelection")
				}, h("div", { className: "ap-ai-sel-hd" }, Icon("sparkles", 16), tAp("preview.aiEditSelection"), h("button", {
					type: "button",
					className: "ap-doc-btn ap-ai-sel-x",
					onClick: () => setAiSel(null)
				}, Icon("x", 14))), h("p", { className: "ap-sub" }, "指令会发回当前主对话，带上本项目记忆。不要另开窗口改。"), h("p", {
					className: "ap-sub",
					style: {
						maxHeight: 72,
						overflow: "auto"
					}
				}, "选中：" + aiSel.text.slice(0, 240) + (aiSel.text.length > 240 ? "…" : "")), h("textarea", {
					placeholder: "改什么、怎么改",
					value: aiSel.instruction,
					onChange: (event) => setAiSel(Object.assign({}, aiSel, { instruction: event.target.value }))
				}), h("div", {
					className: "ap-row",
					style: {
						justifyContent: "flex-end",
						marginTop: 12
					}
				}, DocBtn("取消", () => setAiSel(null)), DocBtn("发给主对话", sendAiSel, [Icon("sparkles", 14), "发给主对话"], !String(aiSel.instruction || "").trim() || aiSel.sending)))) : null);
			}
			function FolderPreviewOverlay(props) {
				useApLang();
				const cwd = props.cwd;
				const [current, setCurrent] = React.useState(props.folder);
				const [items, setItems] = React.useState([]);
				const [error, setError] = React.useState("");
				const [loading, setLoading] = React.useState(true);
				const [menu, setMenu] = React.useState(null);
				React.useEffect(() => {
					setCurrent(props.folder);
				}, [props.folder && props.folder.path]);
				React.useEffect(() => {
					let cancelled = false;
					setLoading(true);
					setError("");
					api("/api/agent-pi/files?parentPath=" + encodeURIComponent(current.path), cwd, { method: "GET" }).then((body) => {
						if (cancelled) return;
						setItems(body.files || []);
						setLoading(false);
					}).catch((e) => {
						if (cancelled) return;
						setError(String(e.message || e));
						setLoading(false);
					});
					return () => {
						cancelled = true;
					};
				}, [cwd, current.path]);
				React.useEffect(() => {
					const onKey = (event) => {
						if (event.key === "Escape") props.onClose();
					};
					window.addEventListener("keydown", onKey);
					return () => window.removeEventListener("keydown", onKey);
				}, [props.onClose]);
				return h("div", {
					className: "ap-doc",
					role: "dialog",
					"aria-modal": "true",
					"aria-label": current.name
				}, h("div", { className: "ap-doc-hd" }, h("div", {
					className: "ap-doc-path",
					title: current.path
				}, current.path), h("div", { className: "ap-doc-actions" }, DocBtn("关闭", props.onClose, [Icon("x", 14)]))), h("div", { className: "ap-doc-scroll" }, h("div", { className: "ap-doc-sheet" }, h("h1", null, current.name), error ? h("div", { className: "ap-err" }, error) : null, loading ? h("div", { className: "ap-doc-status" }, "正在列出文件夹…") : null, !loading && items.length === 0 ? h("p", null, "这个文件夹是空的。") : null, items.map((item) => h("div", {
					key: item.path,
					className: "ap-tree-row"
				}, h("button", {
					type: "button",
					className: "ap-folder-row",
					onClick: () => {
						if (item.type === "directory") setCurrent(item);
						else if (/\.(mpp|xer|pmxml|xml)$/i.test(item.path) && props.onOpenFile) props.onOpenFile(item);
						else mentionInChat(props.sessionProps || props, item);
					},
					onContextMenu: (e) => {
						e.preventDefault();
						e.stopPropagation();
						setMenu({
							x: e.clientX,
							y: e.clientY,
							file: item
						});
					}
				}, Icon(fileIconName(item), 16, fileIconClass(item)), h("span", { style: {
					flex: 1,
					minWidth: 0,
					overflow: "hidden",
					textOverflow: "ellipsis"
				} }, item.name), h("span", { className: "ap-sub" }, item.type === "directory" ? "文件夹" : "")), item.type === "directory" ? null : h("button", {
					type: "button",
					className: "ap-tree-inject",
					title: tAp("files.attachToChat"),
					"aria-label": tAp("files.attachToChat"),
					onClick: (e) => {
						e.preventDefault();
						e.stopPropagation();
						mentionInChat(props.sessionProps || props, item);
					}
				}, Icon("paperclip", 13)))))), h(FileContextMenu, {
					menu,
					onClose: () => setMenu(null)
				}, menu ? [
					h("button", {
						key: "inject",
						type: "button",
						onClick: () => {
							mentionInChat(props.sessionProps || props, menu.file);
							setMenu(null);
						}
					}, Icon("paperclip", 14), tAp("files.attachToChat")),
					menu.file.type !== "directory" || looksLikeKbPackName(menu.file) ? h("button", {
						key: "kb",
						type: "button",
						onClick: () => {
							importWorkspaceFileToKb(cwd, menu.file, props.sessionProps || props);
							setMenu(null);
						}
					}, Icon("filePlus", 14), looksLikeKbPackName(menu.file) ? "一键导入知识包" : "一键导入知识库") : null,
					h("button", {
						key: "open",
						type: "button",
						onClick: () => {
							setMenu(null);
							if (menu.file.type === "directory") setCurrent(menu.file);
							else if (typeof props.onOpenFile === "function") props.onOpenFile(menu.file, current);
						}
					}, Icon(menu.file.type === "directory" ? "folder" : "fileText", 14), "打开")
				] : null));
			}
			function FilesPanel(props) {
				useApLang();
				const cwd = readWorkspaceCwd(props);
				const [files, setFiles] = React.useState([]);
				const [error, setError] = React.useState("");
				const [expanded, setExpanded] = React.useState({});
				const [menu, setMenu] = React.useState(null);
				const [busy, setBusy] = React.useState(false);
				const fileInput = React.useRef(null);
				const folderInput = React.useRef(null);
				const load = React.useCallback(() => {
					if (!cwd) return;
					api("/api/agent-pi/files", cwd, { method: "GET" }).then((body) => {
						const nextFiles = body.files || [];
						runtime.files = flattenFiles(nextFiles, []);
						setFiles(nextFiles);
						setError("");
						setExpanded((prev) => {
							const seeded = {};
							const walk = (nodes) => {
								for (const node of nodes || []) if (node.type === "directory" && node.source === "official-output") {
									seeded[node.path] = true;
									walk(node.children);
								}
							};
							walk(nextFiles);
							return Object.assign({}, seeded, prev);
						});
					}).catch((e) => setError(String(e.message || e)));
				}, [cwd]);
				React.useEffect(() => {
					setExpanded({});
					load();
				}, [load]);
				React.useEffect(() => {
					const onChanged = () => load();
					window.addEventListener("agent-pi-files-changed", onChanged);
					window.addEventListener("agent-pi-created", onChanged);
					return () => {
						window.removeEventListener("agent-pi-files-changed", onChanged);
						window.removeEventListener("agent-pi-created", onChanged);
					};
				}, [load]);
				const toggle = (file) => {
					if (file.type !== "directory") return;
					const open = !expanded[file.path];
					setExpanded((prev) => Object.assign({}, prev, { [file.path]: open }));
					if (open && file.hasMoreChildren && !file.childrenLoaded) api("/api/agent-pi/files?parentPath=" + encodeURIComponent(file.path), cwd, { method: "GET" }).then((body) => {
						const kids = body.files || [];
						setFiles((prev) => replaceChildren(prev, file.path, kids));
						if (file.source === "official-output") setExpanded((prev) => {
							const next = Object.assign({}, prev, { [file.path]: true });
							for (const child of kids) if (child.type === "directory" && (child.source === "official-output" || file.source === "official-output")) next[child.path] = true;
							return next;
						});
					}).catch((e) => setError(String(e.message || e)));
				};
				const openPreview = (file) => {
					setMenu(null);
					if (typeof props.onOpenFile === "function") props.onOpenFile(file);
				};
				const openFolder = (file) => {
					setMenu(null);
					if (typeof props.onOpenFolder === "function") props.onOpenFolder(file);
				};
				const renderNode = (file) => {
					const open = !!expanded[file.path];
					const pill = sourceLabel(file.source);
					return h("div", { key: file.path }, h("div", { className: "ap-tree-row" }, h("button", {
						type: "button",
						className: "ap-tree-btn",
						title: file.relativePath || file.path,
						onClick: () => file.type === "directory" ? openFolder(file) : openPreview(file),
						onDoubleClick: () => {
							if (file.type !== "directory") openPreview(file);
						},
						onContextMenu: (e) => {
							e.preventDefault();
							e.stopPropagation();
							setMenu({
								x: e.clientX,
								y: e.clientY,
								file
							});
						}
					}, file.type === "directory" ? h("span", {
						style: {
							transform: open ? "rotate(90deg)" : "none",
							display: "inline-flex"
						},
						onClick: (event) => {
							event.stopPropagation();
							toggle(file);
						}
					}, Icon("chevron", 12)) : h("span", { style: { width: 12 } }), Icon(fileIconName(file), 16, fileIconClass(file)), h("span", { className: "ap-tree-name" }, displayFileName(file)), pill ? h("span", { className: "ap-chip" + (file.source === "official-output" ? " live" : "") }, pill) : null), file.type === "directory" ? null : h("button", {
						type: "button",
						className: "ap-tree-inject",
						title: tAp("files.attachToChat"),
						"aria-label": tAp("files.attachToChat"),
						onClick: (e) => {
							e.preventDefault();
							e.stopPropagation();
							mentionInChat(props, file);
						}
					}, Icon("paperclip", 13))), file.type === "directory" && open ? h("div", { className: "ap-tree-kids" }, (file.children || []).map(renderNode)) : null);
				};
				const closePanel = () => {
					if (typeof props.onToggle === "function") props.onToggle();
					else if (typeof props.onClose === "function") props.onClose();
					else if (typeof props.closeDetails === "function") props.closeDetails();
				};
				const collapsed = !!props.collapsed;
				const officialRoots = files.filter((file) => file.source === "official-output");
				const workspaceRoots = files.filter((file) => file.source !== "official-output");
				return h("div", { className: "ap-files" }, h("div", { className: "ap-files-hd" }, h("strong", null, tAp("files.title")), h("div", { className: "ap-row" }, h("button", {
					type: "button",
					className: "ap-toolbtn",
					title: tAp("files.uploadFiles"),
					onClick: () => chooseAndUpload(cwd, snapshotComposer(), "files", {
						fileInput,
						folderInput
					}).catch((err) => setError(String(err.message || err)))
				}, Icon("paperclip", 14)), h("button", {
					type: "button",
					className: "ap-toolbtn",
					title: tAp("files.addFolder"),
					onClick: () => chooseFolderForChat(cwd, snapshotComposer()).catch((err) => setError(String(err.message || err)))
				}, Icon("filePlus", 14)), h("button", {
					type: "button",
					className: "ap-toolbtn",
					title: tAp("files.openExplorer"),
					onClick: () => openInExplorer(cwd).catch((err) => setError(String(err && err.message || err)))
				}, Icon("folder", 14)), h("button", {
					type: "button",
					className: "ap-toolbtn",
					title: tAp("files.refresh"),
					onClick: load
				}, Icon("refresh", 14, busy ? "ap-spin" : "")), h("button", {
					type: "button",
					className: "ap-toolbtn ap-files-toggle",
					title: collapsed ? tAp("files.expand") : tAp("files.collapse"),
					"aria-label": collapsed ? tAp("files.expand") : tAp("files.collapse"),
					"aria-expanded": collapsed ? "false" : "true",
					onClick: closePanel
				}, Icon("panelRight", 16)))), h("input", {
					ref: fileInput,
					type: "file",
					multiple: true,
					style: {
						position: "fixed",
						width: 1,
						height: 1,
						opacity: 0,
						pointerEvents: "none"
					},
					onChange: (e) => {
						const list = snapshotFileList(e.target.files);
						e.target.value = "";
						if (!list.length) return;
						setBusy(true);
						uploadFileList(cwd, list, snapshotComposer()).catch((err) => setError(String(err.message || err))).finally(() => setBusy(false));
					}
				}), h("input", {
					ref: folderInput,
					type: "file",
					multiple: true,
					webkitdirectory: "true",
					directory: "true",
					style: {
						position: "fixed",
						width: 1,
						height: 1,
						opacity: 0,
						pointerEvents: "none"
					},
					onChange: (e) => {
						const list = snapshotFileList(e.target.files);
						e.target.value = "";
						if (!list.length) return;
						const rel = String(list[0].webkitRelativePath || list[0].name);
						attachFolderPath(snapshotComposer(), rel.split(/[\\/]/)[0] || "folder");
					}
				}), error ? h("div", {
					className: "ap-err",
					style: { padding: "0 12px" }
				}, error) : null, h("div", { className: "ap-files-tree" }, !cwd ? h("div", {
					className: "ap-sub",
					style: { padding: "8px 6px" }
				}, tAp("files.pickWorkspace")) : [
					h("div", {
						key: "sec-out",
						className: "ap-files-sec"
					}, tAp("files.official")),
					officialRoots.length === 0 ? h("div", {
						key: "out-empty",
						className: "ap-files-empty"
					}, tAp("files.officialEmpty")) : officialRoots.map(renderNode),
					officialRoots.length === 1 && !(officialRoots[0].children || []).length ? h("div", {
						key: "out-hint",
						className: "ap-files-empty"
					}, tAp("files.officialHint")) : null,
					h("div", {
						key: "sec-work",
						className: "ap-files-sec"
					}, tAp("files.workspace")),
					workspaceRoots.length === 0 ? h("div", {
						key: "work-empty",
						className: "ap-sub",
						style: { padding: "8px 6px" }
					}, "工作区还没有可见文件。用上方回形针上传资料。") : workspaceRoots.map(renderNode)
				]), h(FileContextMenu, {
					menu,
					onClose: () => setMenu(null)
				}, menu ? [
					h("button", {
						key: "inject",
						type: "button",
						onClick: () => {
							mentionInChat(props, menu.file);
							setMenu(null);
						}
					}, Icon("paperclip", 14), tAp("files.attachToChat")),
					menu.file.type !== "directory" || looksLikeKbPackName(menu.file) ? h("button", {
						key: "kb",
						type: "button",
						onClick: () => {
							importWorkspaceFileToKb(cwd, menu.file, props);
							setMenu(null);
						}
					}, Icon("filePlus", 14), looksLikeKbPackName(menu.file) ? "一键导入知识包" : "一键导入知识库") : null,
					h("button", {
						key: "open",
						type: "button",
						onClick: () => menu.file.type === "directory" ? openFolder(menu.file) : openPreview(menu.file)
					}, Icon(menu.file.type === "directory" ? "folder" : "fileText", 14), "打开"),
					menu.file.type !== "directory" && menu.file.source !== "official-output" ? h("button", {
						key: "promote",
						type: "button",
						onClick: () => {
							api("/api/agent-pi/files/promote", cwd, {
								method: "POST",
								body: JSON.stringify({ path: menu.file.path })
							}).then(() => {
								window.dispatchEvent(new Event("agent-pi-files-changed"));
								setMenu(null);
							}).catch((e) => setError(String(e.message || e)));
						}
					}, Icon("export", 14), "导出到正式产出") : null,
					h("button", {
						key: "reveal",
						type: "button",
						onClick: () => {
							openInExplorer(cwd, menu.file.path, {
								file: menu.file,
								reveal: menu.file.type !== "directory"
							}).catch((err) => setError(String(err && err.message || err)));
							setMenu(null);
						}
					}, Icon("folder", 14), "在资源管理器中显示")
				] : null));
			}
			return {
				FilePreviewOverlay,
				FolderPreviewOverlay,
				FilesPanel
			};
		}
		//#endregion
		//#region src/client/knowledge-base-panel.js
		function createKnowledgeBasePanel(dependencies) {
			const { Icon, KB_PRESET_CATEGORIES, React, apJoin, api, apiBlob, desktopApi, diskPathOf, downloadBlob, ensureKbFileInput, fileIconClass, fileIconName, fileName, formatKbBytes, groupKbEntries, h, kbCategoryHint, kbCategoryLabel, kbChatImportCopy, kbFidelityLabel, kbIngestKind, kbIngestLabel, kbLandingCardVisible, kbPickPatch, kbPickState, kbPickUpsert, kbProgressText, kbTitle, mergeKbEntries, normalizePickedPaths, parkKbFileInput, resolveSessionId, runtime, sortKbCategories, tAp, uploadKbBytes, useApLang } = dependencies;
			const newDraftKey = () => "kb-draft:" + Date.now().toString(36) + ":" + Math.random().toString(36).slice(2);
			let draftKey = newDraftKey();
			const kbDraftKey = () => draftKey;
			const pendingSelections = /* @__PURE__ */ new Map();
			function kbSessionKey(sessionId) {
				const sid = String(sessionId || "").trim();
				return sid && sid !== "active" ? sid : draftKey;
			}
			function kbTaskStorageKey(sessionId) {
				return "ap-kb-task:" + kbSessionKey(sessionId);
			}
			function readKbTaskSlugs(sessionId) {
				try {
					const parsed = JSON.parse(sessionStorage.getItem(kbTaskStorageKey(sessionId)) || "[]");
					return Array.isArray(parsed) ? parsed.map(String) : [];
				} catch {
					return [];
				}
			}
			function writeKbTaskSlugs(sessionId, slugs) {
				try {
					sessionStorage.setItem(kbTaskStorageKey(sessionId), JSON.stringify(slugs || []));
				} catch {}
			}
			function kbTaskStore() {
				return window.__apKbTask || (window.__apKbTask = { bySession: {} });
			}
			function publishKbTask(sessionId, slugs, entries) {
				const sid = kbSessionKey(sessionId);
				const picked = (entries || []).filter((entry) => entry && slugs.indexOf(entry.slug) >= 0);
				kbTaskStore().bySession[sid] = {
					slugs: (slugs || []).slice(),
					entries: picked
				};
				writeKbTaskSlugs(sid, slugs);
			}
			function kbTaskOf(sessionId) {
				const sid = kbSessionKey(sessionId);
				const published = kbTaskStore().bySession[sid];
				if (published && Array.isArray(published.slugs)) return published;
				return {
					slugs: readKbTaskSlugs(sid),
					entries: []
				};
			}
			function persistKbTask(sessionId, slugs, entries, cwd) {
				const sid = kbSessionKey(sessionId);
				publishKbTask(sid, slugs, entries);
				if (sid === draftKey) return Promise.resolve(slugs);
				const published = kbTaskStore().bySession[sid];
				const request = (pendingSelections.get(sid) || Promise.resolve()).catch(() => {}).then(() => api("/api/agent-pi/kb", cwd || "", {
					method: "POST",
					body: JSON.stringify({
						action: "select",
						slugs,
						sessionId: sid
					})
				})).then((body) => {
					if (kbTaskStore().bySession[sid] === published && body && Array.isArray(body.selectedSlugs)) publishKbTask(sid, body.selectedSlugs.map(String), entries);
					return kbTaskOf(sid).slugs;
				});
				pendingSelections.set(sid, request);
				request.then(() => {
					if (pendingSelections.get(sid) === request) pendingSelections.delete(sid);
				}, () => {});
				return request;
			}
			function resetDraftKbTask() {
				delete kbTaskStore().bySession[draftKey];
				try {
					sessionStorage.removeItem(kbTaskStorageKey(draftKey));
				} catch {}
				draftKey = newDraftKey();
			}
			function claimDraftKbTask(sessionId, createdFromDraft = false, expectedDraftKey = draftKey) {
				const sid = String(sessionId || "").trim();
				if (!createdFromDraft || expectedDraftKey !== draftKey || !sid || sid === "active") return Promise.resolve([]);
				const task = kbTaskOf(draftKey);
				resetDraftKbTask();
				return persistKbTask(sid, task.slugs, task.entries);
			}
			async function flushKbTaskSelection(sessionId) {
				const sid = kbSessionKey(sessionId);
				while (pendingSelections.has(sid)) await pendingSelections.get(sid);
			}
			function hasKbTaskSelectionSave(sessionId) {
				return pendingSelections.has(kbSessionKey(sessionId));
			}
			function formatKbTaskBlock(sessionId) {
				const task = kbTaskOf(sessionId);
				if (!task.slugs || !task.slugs.length) return "";
				return [
					"<!--agent-pi-kb-task-->",
					"本次任务选用知识库（入库后即时生效，仅下列条目在范围内）：",
					(task.entries && task.entries.length ? task.entries.map((entry) => "- [" + (entry.category || "") + "] " + kbTitle(entry) + " — " + entry.slug) : task.slugs.map((slug) => "- " + slug)).join("\n"),
					"检索用 kb_search({ slugs }) / kb_find_clause / kb_find_table，再 kb_read_chunk。引用 [kb:slug:chunkId]。未列出的条目不要当成本次依据。",
					"<!--/agent-pi-kb-task-->"
				].join("\n");
			}
			function KnowledgeBasePanel(props) {
				useApLang();
				const cwd = props.cwd || "";
				const sessionId = kbSessionKey(props.sessionId || resolveSessionId(props) || runtime.sessionId);
				const inputStyle = {
					flex: "1 1 160px",
					minWidth: 0,
					padding: "7px 10px",
					borderRadius: 8,
					border: "1px solid var(--dsw-border, rgba(127,127,127,.35))",
					background: "transparent",
					color: "inherit",
					font: "inherit"
				};
				const [data, setData] = React.useState(null);
				const [error, setError] = React.useState("");
				const [busy, setBusy] = React.useState("");
				const [notice, setNotice] = React.useState("");
				const [addPath, setAddPath] = React.useState("");
				const [addCategory, setAddCategory] = React.useState("规范");
				const [customCategory, setCustomCategory] = React.useState("");
				const [addName, setAddName] = React.useState("");
				const [pickedLabel, setPickedLabel] = React.useState("");
				const [selection, setSelection] = React.useState(() => ({
					sessionId,
					slugs: readKbTaskSlugs(sessionId)
				}));
				const selectedSlugs = selection.sessionId === sessionId ? selection.slugs : kbTaskOf(sessionId).slugs;
				const setSelectedSlugs = (slugs) => setSelection({
					sessionId,
					slugs
				});
				const sessionRef = React.useRef(sessionId);
				sessionRef.current = sessionId;
				const loadVersion = React.useRef(0);
				const selectedRef = React.useRef(selectedSlugs);
				selectedRef.current = selectedSlugs;
				const [query, setQuery] = React.useState("");
				const [hits, setHits] = React.useState(null);
				const [tokenDraft, setTokenDraft] = React.useState("");
				const [dragOver, setDragOver] = React.useState(false);
				const pickWrapRef = React.useRef(null);
				const [, setPickTick] = React.useState(0);
				const parsingRef = React.useRef([]);
				const [success, setSuccess] = React.useState("");
				const [folderDialog, setFolderDialog] = React.useState(null);
				const [confirmDialog, setConfirmDialog] = React.useState(null);
				const folderInputRef = React.useRef(null);
				const KB_FILE_RE = /\.(md|markdown|txt|json|pdf|docx?|pptx?|xlsx?|xls|png|jpe?g|jp2|webp|gif|bmp|apkb)$/i;
				const KB_TEXT_RE = /\.(md|markdown|txt|json)$/i;
				const PRESET_CATEGORIES = KB_PRESET_CATEGORIES;
				const resolveCategory = () => addCategory === "__custom__" ? customCategory.trim() || "未分类" : addCategory.trim() || "规范";
				const persistSelection = React.useCallback((slugs, entries) => {
					setError("");
					selectedRef.current = slugs;
					return persistKbTask(sessionId, slugs, entries || [], cwd).then((next) => {
						if (sessionRef.current === sessionId) selectedRef.current = next;
						return next;
					}).catch((e) => {
						if (sessionRef.current === sessionId) setError(String(e.message || e));
						return slugs;
					});
				}, [cwd, sessionId]);
				const load = React.useCallback((preferredSlugs) => {
					const version = ++loadVersion.current;
					const before = kbTaskStore().bySession[sessionId];
					return api("/api/agent-pi/kb?sessionId=" + encodeURIComponent(sessionId), cwd, { method: "GET" }).then((body) => {
						if (sessionRef.current !== sessionId || version !== loadVersion.current) return body;
						const merged = mergeKbEntries(body && body.entries || [], kbPickState.entries);
						kbPickState.entries = merged.filter((entry) => String(entry && entry.slug || "").indexOf("local:") === 0);
						if (!kbLandingCardVisible(kbPickState.pickedLabel, merged)) {
							kbPickPatch({
								pickedLabel: "",
								notice: kbPickState.notice
							});
							setPickedLabel("");
						}
						setData(Object.assign({}, body || {}, {
							entries: merged,
							entryCount: merged.length
						}));
						setError(kbPickState.error || "");
						const fromServer = Object.prototype.hasOwnProperty.call(body, "selectedSlugs") && Array.isArray(body.selectedSlugs) ? body.selectedSlugs.map(String) : null;
						const local = readKbTaskSlugs(sessionId);
						const current = kbTaskStore().bySession[sessionId];
						const next = current && (current !== before || pendingSelections.has(sessionId) || sessionId === draftKey) ? current.slugs : fromServer || preferredSlugs || local;
						selectedRef.current = next;
						setSelectedSlugs(next);
						publishKbTask(sessionId, next, body && body.entries || []);
						if (body && !Object.prototype.hasOwnProperty.call(body, "mineru")) setNotice(tAp("kb.oldHostMineru"));
						return body;
					}).catch((e) => {
						if (sessionRef.current === sessionId && version === loadVersion.current) setError(String(e.message || e));
					});
				}, [cwd, sessionId]);
				React.useEffect(() => {
					load();
				}, [load]);
				React.useEffect(() => {
					const sync = () => setPickTick((n) => n + 1);
					kbPickState.listeners.add(sync);
					if (kbPickState.pickedLabel) setPickedLabel(kbPickState.pickedLabel);
					if (kbPickState.error) setError(kbPickState.error);
					if (kbPickState.notice) setNotice(kbPickState.notice);
					return () => {
						kbPickState.listeners.delete(sync);
					};
				}, []);
				React.useEffect(() => {
					if (!folderDialog) return void 0;
					const node = folderInputRef.current;
					if (node && typeof node.focus === "function") node.focus();
				}, [folderDialog]);
				React.useEffect(() => {
					const input = ensureKbFileInput();
					const slot = pickWrapRef.current;
					if (input && slot && input.parentNode !== slot) slot.appendChild(input);
					return () => {
						parkKbFileInput();
					};
				});
				React.useEffect(() => {
					const onChanged = () => {
						load(selectedRef.current);
					};
					window.addEventListener("agent-pi-kb-changed", onChanged);
					return () => window.removeEventListener("agent-pi-kb-changed", onChanged);
				}, [load]);
				React.useEffect(() => {
					const entries = data && data.entries || [];
					const parsing = entries.filter((entry) => entry.parseStatus === "parsing").map((entry) => entry.slug);
					const newlyReady = parsingRef.current.filter((slug) => {
						const entry = entries.find((item) => item.slug === slug);
						return entry && entry.parseStatus === "ready";
					});
					if (newlyReady.length) {
						setSuccess(tAp("kb.ingestedOk", { names: newlyReady.map((slug) => {
							return kbTitle(entries.find((item) => item.slug === slug));
						}).join("、") }));
						setNotice("");
					}
					parsingRef.current = parsing;
					if (!parsing.length) return void 0;
					const timer = setInterval(() => {
						load(selectedRef.current);
					}, 1500);
					return () => clearInterval(timer);
				}, [
					data,
					load,
					persistSelection
				]);
				const post = (body, busyKey) => {
					setBusy(busyKey);
					setError("");
					setNotice("");
					return api("/api/agent-pi/kb", cwd, {
						method: "POST",
						body: JSON.stringify(body)
					}).catch((e) => {
						setError(String(e.message || e));
						return null;
					}).finally(() => setBusy(""));
				};
				const mergeKbEntry = (entry) => {
					if (!entry || !entry.slug) return;
					kbPickUpsert(entry);
					setData((current) => {
						const localName = "local:" + (entry.name || entry.originalName || "");
						const entries = (current && current.entries || []).filter((item) => item.slug !== entry.slug && item.slug !== localName);
						const next = [entry].concat(entries);
						return Object.assign({}, current || {}, {
							entries: next,
							entryCount: next.length
						});
					});
				};
				const applyTransferResult = (result) => {
					if (!result) return result;
					const entryNames = (result.entries || []).map((entry) => entry.name || entry.slug);
					const skillNames = (result.skills || []).map((skill) => skill.slug);
					const parts = [];
					if (entryNames.length) parts.push(tAp("kb.transferEntries", { n: entryNames.length }));
					if (skillNames.length) parts.push(tAp("kb.transferSkills", { n: skillNames.length }));
					setNotice(tAp("kb.transferImported", {
						parts: parts.length ? apJoin(parts) : tAp("kb.transferEmpty"),
						detail: entryNames[0] ? "（" + apJoin(entryNames.slice(0, 3)) + "）" : ""
					}));
					setSuccess(tAp("kb.transferSaved"));
					setAddPath("");
					return load(selectedRef.current);
				};
				const isTransferResult = (result) => result && !result.entry && (Array.isArray(result.entries) || Array.isArray(result.skills));
				const applyStageResult = (result) => {
					if (!result) return;
					if (isTransferResult(result)) return applyTransferResult(result);
					const slug = result.entry && result.entry.slug;
					const known = (data && data.entries || []).concat(result.entry || []);
					if (result.staged || result.entry && result.entry.parseStatus === "staged") {
						mergeKbEntry(result.entry);
						setNotice(tAp("kb.stagedNotice", { name: result.entry && kbTitle(result.entry) || slug }));
						setSuccess("");
						setAddPath("");
						setAddName("");
						return result;
					}
					const next = slug ? selectedRef.current.concat(slug).filter((item, index, all) => all.indexOf(item) === index) : selectedRef.current;
					selectedRef.current = next;
					setSelectedSlugs(next);
					publishKbTask(sessionId, next, known);
					setNotice(tAp(result.skipped ? "kb.skipUnchanged" : result.replaced ? "kb.replacedTask" : "kb.ingestedTask", { name: result.entry && kbTitle(result.entry) || slug }));
					setAddPath("");
					setAddName("");
					return persistSelection(next, known).then((slugs) => load(slugs || next));
				};
				const doStage = (pathOverride) => {
					const path = String(pathOverride || addPath || "").trim();
					if (!path) {
						setError(tAp("kb.needFile"));
						return Promise.resolve();
					}
					setPickedLabel(fileName(path));
					setSuccess("");
					return post({
						action: "stage",
						path,
						sessionId,
						category: resolveCategory(),
						name: addName.trim() || void 0
					}, "add").then(applyStageResult);
				};
				const addManyPaths = (paths) => {
					const list = normalizePickedPaths(paths);
					if (!list.length) return Promise.resolve();
					const label = apJoin(list.map(fileName));
					setPickedLabel(label);
					kbPickPatch({
						pickedLabel: label,
						error: "",
						notice: tAp("kb.thisPick", { name: label })
					});
					list.forEach((path) => {
						if (/\.apkb$/i.test(path)) return;
						mergeKbEntry({
							slug: "local:" + fileName(path),
							name: fileName(path),
							category: resolveCategory(),
							parseStatus: "staged",
							parseProgress: tAp("kb.landingProgress"),
							sizeBytes: 0
						});
					});
					return list.reduce((chain, path) => chain.then(() => doStage(path)), Promise.resolve()).then(() => load(selectedRef.current));
				};
				const addBrowserFiles = (fileList) => {
					const files = Array.from(fileList || []);
					if (!files.length) return;
					const unsupported = files.filter((file) => !KB_FILE_RE.test(file.name || ""));
					const supported = files.filter((file) => KB_FILE_RE.test(file.name || ""));
					if (!supported.length) {
						setError(tAp("kb.badTypes"));
						return;
					}
					if (unsupported.length) setNotice(tAp("kb.skippedTypes", { names: apJoin(unsupported.map((file) => file.name)) }));
					const label = apJoin(supported.map((file) => file.name));
					setPickedLabel(label);
					kbPickPatch({
						pickedLabel: label,
						error: "",
						notice: tAp("kb.thisPick", { name: label })
					});
					supported.forEach((file) => {
						if (/\.apkb$/i.test(file.name || "")) return;
						mergeKbEntry({
							slug: "local:" + (file.name || "file"),
							name: file.name || "file",
							category: resolveCategory(),
							parseStatus: "staged",
							parseProgress: tAp("kb.landingProgress"),
							sizeBytes: file.size || 0
						});
					});
					supported.reduce((chain, file) => chain.then(async () => {
						const disk = diskPathOf(file);
						if (disk) return doStage(disk);
						if (KB_TEXT_RE.test(file.name || "")) {
							let text = "";
							try {
								text = await file.text();
							} catch {
								text = "";
							}
							if (text && text.trim()) {
								const viaText = await post({
									action: "stage",
									fileName: file.name,
									text,
									sessionId,
									category: resolveCategory(),
									name: addName.trim() || void 0
								}, "add");
								if (viaText) return applyStageResult(viaText);
							}
						}
						return applyStageResult(await uploadKbBytes(cwd, file, {
							sessionId,
							category: resolveCategory(),
							name: addName.trim() || void 0,
							stage: true
						}));
					}), Promise.resolve()).then(() => load(selectedRef.current)).catch((err) => {
						const message = String(err && err.message || err);
						setError(message);
						kbPickPatch({ error: message });
					});
				};
				React.useEffect(() => {
					kbPickState.addManyPaths = addManyPaths;
					kbPickState.addBrowserFiles = addBrowserFiles;
					if (kbPickState.pendingPaths && kbPickState.pendingPaths.length) {
						const leftover = kbPickState.pendingPaths.slice();
						kbPickState.pendingPaths = [];
						addManyPaths(leftover);
					}
					if (kbPickState.pendingFiles && kbPickState.pendingFiles.length) {
						const leftover = kbPickState.pendingFiles.slice();
						kbPickState.pendingFiles = [];
						addBrowserFiles(leftover);
					}
					return () => {
						if (kbPickState.addManyPaths === addManyPaths) kbPickState.addManyPaths = null;
						if (kbPickState.addBrowserFiles === addBrowserFiles) kbPickState.addBrowserFiles = null;
					};
				});
				const normalizeMineruToken = (raw) => String(raw || "").trim().replace(/^authorization:\s*/i, "").replace(/^bearer\s+/i, "").replace(/^["']+|["']+$/g, "").trim();
				const applyMineruStatus = (status) => {
					if (!status || status.configured !== true) return false;
					setData((current) => Object.assign({}, current || {}, { mineru: {
						configured: true,
						hint: kbProgressText(status.hint || tAp("kb.mineruSavedHint"))
					} }));
					setNotice(kbProgressText(status.hint || tAp("kb.mineruSavedHint")));
					return true;
				};
				const saveMineru = () => {
					const token = normalizeMineruToken(tokenDraft);
					if (!token) {
						setError(tAp("kb.needToken"));
						return;
					}
					setBusy("mineru");
					setError("");
					setNotice("");
					api("/api/agent-pi/kb/mineru", cwd, {
						method: "POST",
						body: JSON.stringify({ token })
					}).catch(() => api("/api/agent-pi/kb", cwd, {
						method: "POST",
						body: JSON.stringify({
							action: "mineru-save",
							token
						})
					})).then((result) => {
						if (applyMineruStatus(result)) {
							setTokenDraft("");
							return;
						}
						setError(tAp("kb.saveNoDisk"));
					}).catch((e) => {
						const msg = String(e && e.message || e);
						setError(/cwd is required|Bad Request|Not Found/i.test(msg) ? tAp("kb.oldHostSave") : msg);
					}).finally(() => setBusy(""));
				};
				const probeMineru = () => {
					const token = normalizeMineruToken(tokenDraft);
					if (!token && !(data && data.mineru && data.mineru.configured)) {
						setError(tAp("kb.needTokenOrSave"));
						return;
					}
					setBusy("mineru-probe");
					setError("");
					setNotice("");
					api("/api/agent-pi/kb/mineru", cwd, {
						method: "POST",
						body: JSON.stringify({
							action: "probe",
							token: token || void 0
						})
					}).catch(() => api("/api/agent-pi/kb", cwd, {
						method: "POST",
						body: JSON.stringify({
							action: "mineru-probe",
							token: token || void 0
						})
					})).then((result) => {
						if (!result || typeof result.ok !== "boolean") {
							setError(tAp("kb.probeMissing"));
							return;
						}
						if (result.ok) {
							setData((current) => Object.assign({}, current || {}, { mineru: Object.assign({}, current && current.mineru || {}, {
								configured: result.configured,
								hint: result.hint || current && current.mineru && current.mineru.hint || "",
								probed: true,
								probeOk: true
							}) }));
							setNotice(result.message || tAp("kb.tokenOk"));
							return;
						}
						setData((current) => Object.assign({}, current || {}, { mineru: Object.assign({}, current && current.mineru || {}, {
							probed: true,
							probeOk: false
						}) }));
						setError(result.message || tAp("kb.tokenBad"));
					}).catch((e) => {
						const msg = String(e && e.message || e);
						setError(/cwd is required|Bad Request|Not Found/i.test(msg) ? tAp("kb.probeMissing") : msg);
					}).finally(() => setBusy(""));
				};
				const clearMineru = () => {
					setBusy("mineru");
					setError("");
					setNotice("");
					api("/api/agent-pi/kb/mineru", cwd, {
						method: "POST",
						body: JSON.stringify({ action: "clear" })
					}).catch(() => api("/api/agent-pi/kb", cwd, {
						method: "POST",
						body: JSON.stringify({ action: "mineru-clear" })
					})).then((result) => {
						if (result && result.configured === false) {
							setData((current) => Object.assign({}, current || {}, { mineru: {
								configured: false,
								hint: ""
							} }));
							setTokenDraft("");
							setNotice(tAp("kb.cleared"));
							return;
						}
						setError(tAp("kb.clearFailed"));
					}).catch((e) => setError(String(e && e.message || e))).finally(() => setBusy(""));
				};
				const openKbPreview = (entry) => {
					if (!entry || entry.parseStatus === "parsing" || entry.parseStatus === "staged") return;
					if (entry.parseStatus === "failed") {
						setError(entry.parseError || tAp("kb.parseRetry"));
						return;
					}
					window.dispatchEvent(new CustomEvent("agent-pi-open-file", { detail: {
						cwd,
						path: "kb://" + entry.slug + ".md",
						name: kbTitle(entry),
						kbSlug: entry.slug,
						kbHasSource: Boolean(entry.originalPath)
					} }));
				};
				const doRemove = (entry) => {
					if (String(entry.slug || "").indexOf("local:") === 0) {
						setData((current) => {
							const entries = (current && current.entries || []).filter((item) => item.slug !== entry.slug);
							return Object.assign({}, current || {}, {
								entries,
								entryCount: entries.length
							});
						});
						return;
					}
					setConfirmDialog({
						title: tAp("kb.delete"),
						body: tAp("kb.deleteEntryConfirm", {
							name: kbTitle(entry),
							seeded: entry.seeded ? tAp("kb.deleteSeeded") : ""
						}),
						onConfirm: () => {
							setConfirmDialog(null);
							post({
								action: "remove",
								slug: entry.slug
							}, "rm:" + entry.slug).then((result) => {
								if (result) {
									const next = selectedSlugs.filter((item) => item !== entry.slug);
									setSelectedSlugs(next);
									persistSelection(next, data && data.entries || []);
									setNotice(tAp("kb.deleted", { slug: entry.slug }));
									load();
								}
							});
						}
					});
				};
				const doReindex = (slug) => {
					post({
						action: "reindex",
						slug: slug || void 0
					}, "ri:" + (slug || "all")).then((result) => {
						if (!result) return;
						const missing = (result.missing || []).length ? tAp("kb.missingSrc", { list: result.missing.join(", ") }) : "";
						setNotice(tAp("kb.reindexed", {
							n: (result.reindexed || []).length,
							missing
						}));
						load();
					});
				};
				const doCreateFolder = (category, moveSlug) => {
					setFolderDialog({
						category,
						name: "",
						moveSlug: moveSlug || "",
						prompt: moveSlug ? tAp("kb.newFolderPrompt") : tAp("kb.folderPrompt")
					});
				};
				const submitFolder = () => {
					if (!folderDialog) return;
					const name = String(folderDialog.name || "").trim();
					if (!name) return;
					const category = folderDialog.category;
					const moveSlug = folderDialog.moveSlug;
					setFolderDialog(null);
					post({
						action: "folder-create",
						category,
						name
					}, "folder").then((result) => {
						if (!result) return;
						const id = result.folder && result.folder.id;
						const createdName = result.folder && result.folder.name || name;
						return (moveSlug && id ? post({
							action: "folder-move",
							slug: moveSlug,
							folderId: id
						}, "folder") : Promise.resolve(result)).then((moved) => {
							if (moved) {
								setNotice(tAp("kb.folderCreated", { name: createdName }));
								load();
							}
						});
					});
				};
				const doRemoveFolder = (folder) => {
					setConfirmDialog({
						title: tAp("kb.deleteFolder"),
						body: tAp("kb.deleteFolderConfirm", {
							name: folder.name,
							category: kbCategoryLabel(folder.category)
						}),
						onConfirm: () => {
							setConfirmDialog(null);
							post({
								action: "folder-remove",
								folderId: folder.id
							}, "folder").then((result) => {
								if (!result) return;
								setNotice(tAp("kb.folderDeleted", { name: folder.name }));
								load();
							});
						}
					});
				};
				const doMoveFolder = (entry, folderId) => {
					if (!entry || String(entry.slug || "").indexOf("local:") === 0) return;
					post({
						action: "folder-move",
						slug: entry.slug,
						folderId: folderId || ""
					}, "folder").then((result) => {
						if (result) load();
					});
				};
				const doExport = (query) => {
					const qs = new URLSearchParams();
					if (query && query.slugs && query.slugs.length) qs.set("slugs", query.slugs.join(","));
					if (query && query.folderId) qs.set("folderId", query.folderId);
					if (query && query.skillSlugs && query.skillSlugs.length) qs.set("skillSlugs", query.skillSlugs.join(","));
					setBusy("export");
					setError("");
					setNotice("");
					return apiBlob("/api/agent-pi/kb/transfer?" + qs.toString(), cwd, { method: "GET" }).then((result) => {
						downloadBlob(result.blob, result.filename || "knowledge.apkb");
						setNotice(tAp("kb.exported", { name: result.filename || "" }));
					}).catch((e) => setError(String(e && e.message || e))).finally(() => setBusy(""));
				};
				const doImportTransfer = () => {
					const desktop = desktopApi();
					if (desktop && typeof desktop.pickFiles === "function") {
						Promise.resolve(desktop.pickFiles()).then((raw) => {
							const list = normalizePickedPaths(raw);
							const pack = list.find((path) => /\.apkb$/i.test(path)) || list[0];
							if (!pack) return;
							return doStage(pack);
						}).catch((e) => setError(String(e && e.message || e)));
						return;
					}
					const input = document.createElement("input");
					input.type = "file";
					input.accept = ".apkb,application/octet-stream";
					input.onchange = () => {
						const file = input.files && input.files[0];
						if (!file) return;
						setBusy("add");
						setError("");
						uploadKbBytes(cwd, file, { sessionId }).then(applyStageResult).catch((e) => setError(String(e && e.message || e))).finally(() => setBusy(""));
					};
					input.click();
				};
				const onHomeChange = (entry, value) => {
					if (value === "__new__") {
						doCreateFolder(entry.category, entry.slug);
						return;
					}
					doMoveFolder(entry, value);
				};
				const toggleTaskSlug = (slug, selected) => {
					const next = selected ? selectedSlugs.concat(slug).filter((item, index, all) => all.indexOf(item) === index) : selectedSlugs.filter((item) => item !== slug);
					setSelectedSlugs(next);
					persistSelection(next, data && data.entries || []);
				};
				const doParse = (slugs, options) => {
					const list = Array.isArray(slugs) ? slugs.filter(Boolean) : [];
					setSuccess("");
					return post({
						action: "parse",
						slugs: list.length ? list : void 0,
						slug: list.length === 1 ? list[0] : void 0,
						sessionId,
						force: options && options.force === true,
						preferMineru: options && options.force === true
					}, "parse").then(async (result) => {
						if (!result) return;
						const started = result.started || [];
						const requested = started.concat(result.skipped || []);
						const next = kbTaskOf(sessionId).slugs.concat(requested).filter((item, index, all) => all.indexOf(item) === index);
						if (requested.length) await persistKbTask(sessionId, next, data && data.entries || [], cwd);
						if (sessionRef.current !== sessionId) return result;
						selectedRef.current = next;
						setSelectedSlugs(next);
						if (started.length) setNotice(tAp("kb.parseStarted", { n: started.length }));
						else setNotice(tAp("kb.parseNone"));
						return load(next);
					}).catch((e) => {
						if (sessionRef.current === sessionId) setError(String(e.message || e));
						return null;
					});
				};
				const doSearch = () => {
					const value = query.trim();
					if (!value) {
						setHits(null);
						return;
					}
					post({
						action: "search",
						query: value,
						limit: 8
					}, "search").then((result) => {
						if (result) setHits(result.hits || []);
					});
				};
				const entries = mergeKbEntries(data && data.entries || [], kbPickState.entries);
				const shownLabel = kbPickState.pickedLabel || pickedLabel;
				const pending = entries.filter((entry) => entry.parseStatus === "staged" || entry.parseStatus === "parsing" || entry.parseStatus === "failed");
				const parseable = pending.filter((entry) => String(entry.slug).indexOf("local:") !== 0 && (entry.parseStatus === "staged" || entry.parseStatus === "failed"));
				const folders = data && Array.isArray(data.folders) ? data.folders : [];
				const groups = {};
				entries.forEach((entry) => {
					(groups[entry.category] = groups[entry.category] || []).push(entry);
				});
				folders.forEach((folder) => {
					if (folder && folder.category && !groups[folder.category]) groups[folder.category] = [];
				});
				const categoryOptions = PRESET_CATEGORIES.concat(Object.keys(groups).filter((name) => name && PRESET_CATEGORIES.indexOf(name) < 0).sort());
				const selectStyle = Object.assign({}, inputStyle, {
					flex: "0 1 160px",
					appearance: "auto"
				});
				const chatImport = kbChatImportCopy();
				return h(React.Fragment, null, h("div", {
					className: "ap-ov",
					style: {
						display: "block",
						overflow: "auto"
					}
				}, h("div", {
					className: "ap-ov-main",
					style: {
						maxWidth: 1080,
						margin: "0 auto"
					}
				}, h("header", { className: "ap-ov-hd" }, h("div", { style: { minWidth: 0 } }, h("h1", null, tAp("kb.title")), h("div", { className: "ap-path" }, Icon("folder", 14), h("span", { title: data && data.root || "" }, data && data.root || "…"))), h("div", { className: "ap-actions" }, h("button", {
					type: "button",
					className: "ap-btn",
					onClick: () => load()
				}, Icon("refresh", 14), tAp("kb.refresh")), h("button", {
					type: "button",
					className: "ap-btn",
					disabled: !!busy,
					title: tAp("kb.reindexTitle"),
					onClick: () => doReindex()
				}, Icon("refresh", 14), busy === "ri:all" ? tAp("kb.reindexing") : tAp("kb.reindexAll")))), error || kbPickState.error ? h("div", { className: "ap-err" }, error || kbPickState.error) : null, success ? h("div", { className: "ap-kb-ok" }, success) : null, notice ? h("div", {
					className: "ap-sub",
					style: { padding: "6px 0" }
				}, notice) : null, h("section", {
					className: "ap-sec" + (dragOver ? " ap-kb-drop" : ""),
					onDragEnter: (e) => {
						e.preventDefault();
						setDragOver(true);
					},
					onDragOver: (e) => {
						e.preventDefault();
						setDragOver(true);
					},
					onDragLeave: (e) => {
						if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
					},
					onDrop: (e) => {
						e.preventDefault();
						setDragOver(false);
						addBrowserFiles(e.dataTransfer && e.dataTransfer.files);
					}
				}, h("div", {
					className: "ap-row",
					style: {
						gap: 8,
						alignItems: "center",
						flexWrap: "wrap"
					}
				}, h("h2", { style: { margin: 0 } }, tAp("kb.import")), data && data.mineru && data.mineru.probeOk ? h("span", { className: "ap-chip ok" }, tAp("kb.tokenOk")) : data && data.mineru && data.mineru.probed ? h("span", { className: "ap-chip warn" }, tAp("kb.tokenBad")) : null, data && data.mineru && data.mineru.configured ? h("span", { className: "ap-chip ok" }, kbProgressText(data.mineru.hint) || tAp("kb.mineruSaved")) : h("span", { className: "ap-chip warn" }, data && data.mineru ? tAp("kb.mineruMissing") : tAp("kb.mineruNeedRestart"))), h("div", { className: "ap-kb-paths" }, h("div", { className: "ap-kb-path" }, h("strong", null, tAp("kb.path1Title")), h("p", null, tAp("kb.path1Body"))), h("div", { className: "ap-kb-path" }, h("strong", null, chatImport.title), h("p", null, chatImport.warn), h("p", { className: "ap-kb-say" }, chatImport.say), h("p", null, chatImport.after)), h("div", { className: "ap-kb-path" }, h("strong", null, tAp("kb.tplTitle")), h("p", null, tAp("kb.tplBody"))), h("div", { className: "ap-kb-path" }, h("strong", null, tAp("kb.packTitle")), h("p", null, tAp("kb.packBody")))), h("div", {
					className: "ap-row",
					style: {
						gap: 8,
						flexWrap: "wrap",
						marginTop: 8,
						alignItems: "center"
					}
				}, h("div", {
					ref: pickWrapRef,
					className: "ap-btn primary ap-kb-pick",
					style: busy === "add" ? {
						pointerEvents: "none",
						opacity: .65
					} : null,
					title: tAp("kb.pickTitle")
				}, Icon("filePlus", 14), busy === "add" ? tAp("kb.picking") : tAp("kb.pickFiles")), h("button", {
					type: "button",
					className: "ap-btn",
					disabled: !!busy,
					title: tAp("kb.importPackTitle"),
					onClick: doImportTransfer
				}, Icon("download", 14), busy === "add" ? tAp("kb.importing") : tAp("kb.importPack")), h("button", {
					type: "button",
					className: "ap-btn primary",
					disabled: !!busy || !parseable.length,
					title: tAp("kb.parseTitle"),
					onClick: () => doParse(parseable.map((entry) => entry.slug))
				}, Icon("play", 14), busy === "parse" ? tAp("kb.parsing") : tAp("kb.parseIn")), h("select", {
					style: selectStyle,
					value: addCategory,
					title: tAp("kb.category"),
					"aria-label": tAp("kb.category"),
					onChange: (e) => setAddCategory(e.target.value)
				}, categoryOptions.map((name) => h("option", {
					key: name,
					value: name
				}, kbCategoryLabel(name))), h("option", { value: "__custom__" }, tAp("kb.customCategory"))), addCategory === "__custom__" ? h("input", {
					style: inputStyle,
					placeholder: tAp("kb.customCategoryPh"),
					value: customCategory,
					onChange: (e) => setCustomCategory(e.target.value)
				}) : null, h("input", {
					style: inputStyle,
					placeholder: tAp("kb.customNamePh"),
					value: addName,
					onChange: (e) => setAddName(e.target.value)
				})), shownLabel ? h("p", {
					className: "ap-sub",
					style: { marginTop: 8 }
				}, tAp("kb.thisPick", { name: shownLabel })) : h("p", {
					className: "ap-sub",
					style: { marginTop: 8 }
				}, tAp("kb.multiHint")), pending.length ? h("div", { className: "ap-kb-files" }, pending.map((entry) => {
					const parsing = entry.parseStatus === "parsing";
					const failed = entry.parseStatus === "failed";
					const percent = parsing ? Math.max(6, Math.min(99, Number(entry.parsePercent) || 12)) : failed ? 100 : 0;
					return h("div", {
						key: entry.slug,
						className: "ap-kb-file"
					}, h("div", { className: "ap-kb-file-ico" + (failed ? " warn" : "") }, Icon(fileIconName({
						name: kbTitle(entry),
						type: "file"
					}), 18, fileIconClass({
						name: kbTitle(entry),
						type: "file"
					}))), h("div", { className: "ap-kb-file-main" }, h("strong", { title: kbTitle(entry) }, kbTitle(entry)), h("div", { className: "ap-sub" }, formatKbBytes(entry.sizeBytes), " · ", parsing ? kbProgressText(entry.parseProgress) || tAp("kb.parsing") : failed ? entry.parseError || tAp("kb.parseFailed") : kbProgressText(entry.parseProgress) || tAp("kb.stagedWait")), parsing || failed ? h("div", {
						className: "ap-bar" + (failed ? " fail" : ""),
						title: String(percent) + "%"
					}, h("i", { style: { width: percent + "%" } })) : null, parsing ? h("div", { className: "ap-sub" }, tAp("kb.progress", { n: percent })) : null), h("span", {
						className: "ap-row",
						style: {
							gap: 6,
							flexShrink: 0
						}
					}, parsing ? h("span", { className: "ap-chip live" }, tAp("kb.parsingChip")) : failed ? h("span", { className: "ap-chip warn" }, tAp("kb.failedChip")) : h("span", { className: "ap-chip" }, tAp("kb.pendingChip")), failed ? h("button", {
						type: "button",
						className: "ap-btn link",
						disabled: !!busy,
						onClick: () => doParse([entry.slug])
					}, tAp("kb.retry")) : null, h("button", {
						type: "button",
						className: "ap-btn link",
						disabled: !!busy || parsing,
						onClick: () => doRemove(entry)
					}, tAp("kb.remove"))));
				})) : kbLandingCardVisible(shownLabel, entries) ? h("div", { className: "ap-kb-files" }, h("div", { className: "ap-kb-file" }, h("div", { className: "ap-kb-file-ico" }, Icon("filePlus", 18)), h("div", { className: "ap-kb-file-main" }, h("strong", null, shownLabel), h("div", { className: "ap-sub" }, tAp("kb.landing"))))) : null, h("details", {
					style: { marginTop: 10 },
					open: !(data && data.mineru && data.mineru.configured)
				}, h("summary", {
					className: "ap-sub",
					style: { cursor: "pointer" }
				}, tAp("kb.mineruSummary")), h("p", {
					className: "ap-sub",
					style: { marginTop: 8 }
				}, data && data.mineru && data.mineru.configured ? tAp("kb.mineruCurrent", { hint: kbProgressText(data.mineru.hint) || tAp("kb.mineruSavedHint") }) : data && Object.prototype.hasOwnProperty.call(data, "mineru") ? tAp("kb.mineruUnconfigured") : tAp("kb.mineruOldHost")), h("div", {
					className: "ap-row",
					style: {
						gap: 8,
						flexWrap: "wrap",
						marginTop: 8
					}
				}, h("input", {
					type: "password",
					autoComplete: "off",
					style: Object.assign({}, inputStyle, { flex: "2 1 240px" }),
					placeholder: tAp("kb.mineruTokenPh"),
					value: tokenDraft,
					onChange: (e) => setTokenDraft(e.target.value),
					onKeyDown: (e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							saveMineru();
						}
					}
				}), h("button", {
					type: "button",
					className: "ap-btn primary",
					disabled: !!busy || !tokenDraft.trim(),
					onClick: saveMineru
				}, busy === "mineru" ? tAp("kb.saving") : tAp("kb.saveToken")), h("button", {
					type: "button",
					className: "ap-btn",
					disabled: !!busy || !tokenDraft.trim() && !(data && data.mineru && data.mineru.configured),
					title: tAp("kb.probeTitle"),
					onClick: probeMineru
				}, busy === "mineru-probe" ? tAp("kb.probing") : tAp("kb.probe")), data && data.mineru && data.mineru.configured ? h("button", {
					type: "button",
					className: "ap-btn ghost",
					disabled: !!busy,
					onClick: clearMineru
				}, tAp("kb.clear")) : null), h("p", {
					className: "ap-sub",
					style: { marginTop: 8 }
				}, tAp("kb.mineruOcr"))), h("details", {
					style: { marginTop: 8 },
					open: true
				}, h("summary", {
					className: "ap-sub",
					style: { cursor: "pointer" }
				}, tAp("kb.pastePath")), h("div", {
					className: "ap-row",
					style: {
						gap: 8,
						flexWrap: "wrap",
						marginTop: 8
					}
				}, h("input", {
					style: Object.assign({}, inputStyle, { flex: "2 1 320px" }),
					placeholder: tAp("kb.pastePathPh"),
					value: addPath,
					onChange: (e) => setAddPath(e.target.value)
				}), h("button", {
					type: "button",
					className: "ap-btn",
					disabled: busy === "add" || !addPath.trim(),
					onClick: () => doStage()
				}, busy === "add" ? tAp("kb.staging") : tAp("kb.stage"))))), h("details", {
					className: "ap-sec",
					style: { display: "block" }
				}, h("summary", { style: { cursor: "pointer" } }, h("h2", { style: { display: "inline" } }, tAp("kb.searchPreview"))), h("div", {
					className: "ap-row",
					style: {
						gap: 8,
						marginTop: 8
					}
				}, h("input", {
					style: Object.assign({}, inputStyle, { flex: "1 1 auto" }),
					placeholder: tAp("kb.searchPh"),
					value: query,
					onChange: (e) => setQuery(e.target.value),
					onKeyDown: (e) => {
						if (e.key === "Enter") doSearch();
					}
				}), h("button", {
					type: "button",
					className: "ap-btn",
					disabled: busy === "search",
					onClick: doSearch
				}, Icon("search", 14), tAp("kb.search"))), hits === null ? null : hits.length === 0 ? h("p", {
					className: "ap-sub",
					style: { marginTop: 8 }
				}, tAp("kb.noHits")) : hits.map((hit) => h("div", {
					key: hit.slug + hit.chunkId,
					className: "ap-task",
					style: {
						alignItems: "flex-start",
						flexDirection: "column",
						gap: 4
					}
				}, h("div", {
					className: "ap-row",
					style: { gap: 8 }
				}, h("strong", null, hit.title), h("span", { className: "ap-chip" }, hit.slug + ":" + hit.chunkId), h("span", { className: "ap-chip" }, tAp("kb.score", { n: hit.score }))), h("span", { className: "ap-sub" }, hit.snippet)))), h("section", { className: "ap-sec" }, h("h2", null, tAp("kb.entries", { n: data && data.entryCount || 0 })), h("p", { className: "ap-sub" }, tAp("kb.entriesLead", {
					say: chatImport.say,
					n: selectedSlugs.length
				})), entries.length === 0 && folders.length === 0 ? h("p", {
					className: "ap-sub",
					style: { padding: "14px 0" }
				}, tAp("kb.empty")) : sortKbCategories(Object.keys(groups)).map((category) => {
					const tree = groupKbEntries(groups[category], folders, category);
					const renderEntry = (entry) => h("div", {
						key: entry.slug,
						className: "ap-task",
						style: { gap: 10 }
					}, h("div", {
						className: "ap-row",
						style: {
							gap: 8,
							minWidth: 0,
							flex: 1,
							alignItems: "center"
						},
						title: kbTitle(entry)
					}, h("input", {
						type: "checkbox",
						checked: selectedSlugs.indexOf(entry.slug) >= 0,
						title: tAp("kb.taskSelect"),
						onChange: (e) => toggleTaskSlug(entry.slug, e.target.checked)
					}), Icon(fileIconName({
						name: kbTitle(entry),
						type: "file"
					}), 14, fileIconClass({
						name: kbTitle(entry),
						type: "file"
					})), h("button", {
						type: "button",
						className: "ap-btn link",
						style: {
							minWidth: 0,
							overflow: "hidden",
							textOverflow: "ellipsis",
							textAlign: "left",
							padding: 0
						},
						disabled: entry.parseStatus === "parsing" || entry.parseStatus === "staged",
						title: entry.parseStatus === "ready" ? tAp("kb.openPreview") : entry.parseError || kbProgressText(entry.parseProgress) || "",
						onClick: (e) => {
							e.preventDefault();
							e.stopPropagation();
							openKbPreview(entry);
						}
					}, kbTitle(entry))), h("span", {
						className: "ap-row",
						style: {
							gap: 6,
							flexShrink: 0,
							flexWrap: "wrap"
						}
					}, entry.parseStatus === "parsing" ? h("span", { className: "ap-chip live" }, kbProgressText(entry.parseProgress) || tAp("kb.parsing")) : entry.parseStatus === "failed" ? h("span", {
						className: "ap-chip warn",
						title: entry.parseError || ""
					}, tAp("kb.parseFailed")) : entry.parseStatus === "staged" ? h("span", { className: "ap-chip" }, tAp("kb.pendingChip")) : h("span", { className: "ap-chip ok" }, tAp("kb.ready")), entry.parseStatus === "ready" && kbFidelityLabel(entry) ? h("span", {
						className: "ap-chip",
						title: tAp("kb.fidelityTitle")
					}, kbFidelityLabel(entry)) : null, entry.parseStatus === "ready" ? h("span", {
						className: "ap-chip",
						title: kbIngestLabel(entry)
					}, kbIngestLabel(entry)) : null, selectedSlugs.indexOf(entry.slug) >= 0 ? h("span", { className: "ap-chip" }, tAp("kb.inTask")) : null, entry.seeded ? h("span", { className: "ap-chip" }, tAp("kb.seeded")) : null, String(entry.slug || "").indexOf("local:") === 0 ? null : h("span", {
						className: "ap-row",
						style: { gap: 4 }
					}, h("span", { className: "ap-sub" }, tAp("kb.home")), h("select", {
						className: "ap-kb-home",
						title: tAp("kb.homeTitle"),
						value: entry.folderId || "",
						disabled: !!busy,
						onChange: (e) => onHomeChange(entry, e.target.value)
					}, h("option", { value: "" }, tAp("kb.unfiled")), folders.filter((folder) => folder.category === entry.category).map((folder) => h("option", {
						key: folder.id,
						value: folder.id
					}, folder.name)), h("option", { value: "__new__" }, tAp("kb.newFolder")))), entry.parseStatus === "ready" && kbIngestKind(entry) === "local" ? h("button", {
						type: "button",
						className: "ap-btn link",
						disabled: !!busy,
						title: tAp("kb.reparseTitle"),
						onClick: () => doParse([entry.slug], { force: true })
					}, tAp("kb.reparseMineru")) : null, entry.parseStatus === "ready" ? h("button", {
						type: "button",
						className: "ap-btn link",
						disabled: !!busy,
						title: tAp("kb.exportTitle"),
						onClick: () => doExport({ slugs: [entry.slug] })
					}, tAp("kb.export")) : null, h("button", {
						type: "button",
						className: "ap-btn link",
						disabled: !!busy || entry.parseStatus === "parsing",
						onClick: () => doRemove(entry)
					}, tAp("kb.delete"))));
					return h("div", {
						key: category,
						style: { marginTop: 10 }
					}, h("div", {
						className: "ap-row",
						style: {
							gap: 8,
							flexWrap: "wrap"
						}
					}, h("strong", null, kbCategoryLabel(category)), h("span", { className: "ap-sub" }, tAp("kb.count", { n: groups[category].length })), kbCategoryHint(category) ? h("span", { className: "ap-sub" }, kbCategoryHint(category)) : null, h("button", {
						type: "button",
						className: "ap-btn link",
						disabled: !!busy,
						title: tAp("kb.addFolderTitle"),
						onClick: () => doCreateFolder(category)
					}, tAp("kb.addFolder"))), tree.folders.map(({ folder, entries: nested }) => h("div", {
						key: folder.id,
						className: "ap-kb-folder"
					}, h("div", { className: "ap-kb-folder-hd" }, Icon("folder", 14), h("strong", null, folder.name), h("span", { className: "ap-sub" }, tAp("kb.count", { n: nested.length })), nested.some((entry) => entry.parseStatus === "ready") ? h("button", {
						type: "button",
						className: "ap-btn link",
						disabled: !!busy,
						title: tAp("kb.exportFolderTitle"),
						onClick: () => doExport({ folderId: folder.id })
					}, tAp("kb.exportFolder")) : null, h("button", {
						type: "button",
						className: "ap-btn link",
						disabled: !!busy,
						title: tAp("kb.deleteFolderTitle"),
						onClick: () => doRemoveFolder(folder)
					}, tAp("kb.deleteFolder"))), nested.length ? nested.map(renderEntry) : h("p", {
						className: "ap-sub",
						style: { margin: "4px 0 8px" }
					}, tAp("kb.emptyFolder")))), tree.loose.length && tree.folders.length ? h("div", {
						className: "ap-sub",
						style: { margin: "8px 0 2px" }
					}, tAp("kb.unfiled")) : null, tree.loose.map(renderEntry));
				})), h("section", { className: "ap-sec" }, h("h2", null, tAp("kb.skills", { n: data && data.skills && data.skills.length || 0 })), h("p", { className: "ap-sub" }, tAp("kb.skillsLead")), !(data && data.skills && data.skills.length) ? h("p", {
					className: "ap-sub",
					style: { padding: "8px 0" }
				}, tAp("kb.skillsEmpty")) : h("div", {
					className: "ap-kb-skills",
					"data-ap-kb-skills": "1"
				}, data.skills.map((skill) => h("div", {
					key: skill.slug,
					className: "ap-kb-skill"
				}, h("div", { className: "ap-kb-skill-ico" }, Icon("fileText", 16)), h("div", { className: "ap-kb-skill-main" }, h("div", { className: "ap-kb-skill-hd" }, h("strong", { title: skill.name || skill.slug }, skill.name || skill.slug), h("button", {
					type: "button",
					className: "ap-btn link",
					disabled: !!busy,
					title: tAp("kb.exportSkillTitle"),
					onClick: () => doExport({ skillSlugs: [skill.slug] })
				}, tAp("kb.export"))), skill.description ? h("p", {
					className: "ap-kb-skill-desc",
					title: skill.description
				}, skill.description) : null, h("span", { className: "ap-chip" }, skill.slug)))))))), folderDialog ? h("div", {
					className: "ap-overlay",
					"data-ap-kb-folder-dialog": "1",
					onClick: (e) => {
						if (e.target === e.currentTarget) setFolderDialog(null);
					}
				}, h("div", { className: "ap-modal" }, h("h1", null, tAp("kb.addFolder")), h("p", { className: "hint" }, folderDialog.prompt || tAp("kb.folderPrompt")), h("input", {
					ref: folderInputRef,
					value: folderDialog.name,
					placeholder: "COTO 2020",
					onChange: (e) => setFolderDialog(Object.assign({}, folderDialog, { name: e.target.value })),
					onKeyDown: (e) => {
						if (e.key === "Enter") submitFolder();
					}
				}), h("div", { className: "ap-foot" }, h("button", {
					type: "button",
					className: "ap-btn",
					onClick: () => setFolderDialog(null)
				}, tAp("kb.folderCancel")), h("button", {
					type: "button",
					className: "ap-btn primary",
					disabled: !String(folderDialog.name || "").trim(),
					onClick: submitFolder
				}, tAp("kb.folderOk"))))) : null, confirmDialog ? h("div", {
					className: "ap-overlay",
					"data-ap-kb-confirm-dialog": "1",
					onClick: (e) => {
						if (e.target === e.currentTarget) setConfirmDialog(null);
					}
				}, h("div", { className: "ap-modal" }, h("h1", null, confirmDialog.title), h("p", { className: "hint" }, confirmDialog.body), h("div", { className: "ap-foot" }, h("button", {
					type: "button",
					className: "ap-btn",
					onClick: () => setConfirmDialog(null)
				}, tAp("kb.folderCancel")), h("button", {
					type: "button",
					className: "ap-btn primary",
					onClick: () => {
						if (confirmDialog.onConfirm) confirmDialog.onConfirm();
					}
				}, tAp("kb.confirmOk"))))) : null);
			}
			return {
				KnowledgeBasePanel,
				formatKbTaskBlock,
				kbTaskOf,
				claimDraftKbTask,
				flushKbTaskSelection,
				hasKbTaskSelectionSave,
				resetDraftKbTask,
				kbDraftKey
			};
		}
		//#endregion
		//#region src/client/kb-session-bridge.js
		const installed = /* @__PURE__ */ new WeakSet();
		const workspacesInstalled = /* @__PURE__ */ new WeakSet();
		/** Alpha.2 catalogs membership; the main view owns its own reference. */
		function mainSessionId(snapshot) {
			return Object.values(snapshot?.byId || {}).find((row) => (row.retainedBy?.mainView || 0) > 0)?.id || "";
		}
		/** Only main workspace navigation can claim choices from the no-session draft. */
		function installKbWorkspaceBridge(sessions, uiWorkspace, kb) {
			if (!sessions || !uiWorkspace || typeof uiWorkspace.connectWorkspace !== "function" || workspacesInstalled.has(uiWorkspace)) return () => {};
			workspacesInstalled.add(uiWorkspace);
			const connect = uiWorkspace.connectWorkspace;
			let active = true;
			const wrapped = async (...args) => {
				const epoch = !mainSessionId(sessions.list.getSnapshot()) ? kb.kbDraftKey() : null;
				const sessionId = await connect.apply(uiWorkspace, args);
				if (active && epoch) kb.claimDraftKbTask(sessionId, true, epoch).catch(() => {});
				return sessionId;
			};
			uiWorkspace.connectWorkspace = wrapped;
			return () => {
				active = false;
				if (uiWorkspace.connectWorkspace === wrapped) uiWorkspace.connectWorkspace = connect;
				workspacesInstalled.delete(uiWorkspace);
			};
		}
		/** Observe main-view ownership without intercepting background/teammate creation. */
		function installKbSessionBridge(sessions, kb, onSelection) {
			if (!sessions || installed.has(sessions)) return () => {};
			installed.add(sessions);
			let current = mainSessionId(sessions.list.getSnapshot());
			onSelection(current);
			const stop = sessions.list.subscribe(() => {
				const next = mainSessionId(sessions.list.getSnapshot());
				if (next === current) return;
				current = next;
				kb.resetDraftKbTask();
				onSelection(next);
			});
			return () => {
				stop();
				installed.delete(sessions);
			};
		}
		//#endregion
		//#region src/client/native-attachment-adapter.js
		/**
		* Add browser files to the native DSH composer while preserving the 0.1.2
		* image-only contract during the 0.1.3 migration.
		*/
		function addNativeComposerFiles({ conversation, actions, sessionId, files }) {
			const list = (files || []).filter(Boolean);
			if (!list.length || !conversation || !actions) return { status: "unavailable" };
			if (typeof conversation.createDrafts === "function" && typeof conversation.releaseDraftAttachments === "function" && typeof actions.addAttachments === "function") {
				if (!sessionId) return { status: "unavailable" };
				let drafts;
				let released = false;
				const rollback = () => {
					if (!drafts || released) return;
					released = true;
					conversation.releaseDraftAttachments(drafts);
				};
				try {
					drafts = conversation.createDrafts(sessionId, list);
					if (!actions.addAttachments(drafts.map((draft) => draft.id))) {
						rollback();
						return { status: "rejected" };
					}
					return { status: "added" };
				} catch (error) {
					try {
						rollback();
					} catch {}
					return {
						status: "error",
						error
					};
				}
			}
			if (typeof conversation.createDraftImages === "function" && typeof actions.addImages === "function") {
				let images;
				let released = false;
				const rollback = () => {
					if (!images || released || typeof conversation.releaseDraftImages !== "function") return;
					released = true;
					conversation.releaseDraftImages(images);
				};
				try {
					images = conversation.createDraftImages(list);
					if (!actions.addImages(images.map((image) => image.id))) {
						rollback();
						return { status: "rejected" };
					}
					return { status: "added" };
				} catch (error) {
					try {
						rollback();
					} catch {}
					return {
						status: "error",
						error
					};
				}
			}
			return { status: "unavailable" };
		}
		//#endregion
		//#region src/session-wake.ts
		/** Parent is in an open turn. Queue-only is not running. */
		function snapshotIsRunning(snap) {
			return !!(snap && snap.running);
		}
		/** Still-pending composer/host queue rows. */
		function queuedMessages(snap) {
			const queue = snap && Array.isArray(snap.queue) ? snap.queue : [];
			const out = [];
			for (const item of queue) {
				if (!item || !item.id) continue;
				if (item.placement && item.placement !== "queued") continue;
				out.push({
					id: item.id,
					placement: item.placement || "queued"
				});
			}
			return out;
		}
		/** Busy for crash-resume / UI: running or a waiting queue. */
		function snapshotIsBusy(snap) {
			return snapshotIsRunning(snap) || queuedMessages(snap).length > 0;
		}
		/** Root main-session routing target for a workbench action opened from any descendant. */
		function parentSessionTarget(activeId, snap, list) {
			const byId = list?.byId ?? {};
			let target = snap?.subagent?.address?.parentSessionId || activeId;
			const seen = /* @__PURE__ */ new Set();
			while (target && !seen.has(target)) {
				seen.add(target);
				const row = byId[target];
				if (!row || row.origin !== "subagent" || !row.parentId) break;
				target = row.parentId;
			}
			return target;
		}
		/** Live parent/descendant activity shown beside the disk-backed stage board. */
		function sessionActivity(list, parentId) {
			const byId = list?.byId ?? {};
			let childCount = 0;
			let runningChildCount = 0;
			if (parentId) for (const child of Object.values(byId)) {
				if (!child || child.origin !== "subagent" || !child.id) continue;
				const seen = /* @__PURE__ */ new Set();
				let cursor = child;
				let belongs = false;
				while (cursor?.origin === "subagent" && cursor.parentId && !seen.has(cursor.id || "")) {
					if (cursor.id) seen.add(cursor.id);
					if (cursor.parentId === parentId) {
						belongs = true;
						break;
					}
					cursor = byId[cursor.parentId];
				}
				if (!belongs) continue;
				childCount += 1;
				if (child.running) runningChildCount += 1;
			}
			return {
				parentRunning: Boolean(parentId && byId[parentId]?.running),
				childCount,
				runningChildCount
			};
		}
		/** A disk-stage must not auto-resume while its parent or any descendant is executing. */
		function sessionExecutionActive(parentSnap, list, parentId) {
			const activity = sessionActivity(list, parentId);
			return snapshotIsRunning(parentSnap) || activity.parentRunning || activity.runningChildCount > 0;
		}
		/** Workbench-injected wake; do not treat it as another unanswered inbound. */
		function isWorkbenchWakeText(text) {
			return /^(【子代理回推】|【主对话未接续】|【主对话插话】|【评审回推】|【事务自动接续】)/.test(String(text || "").trim());
		}
		/** Official Chat legacy projection first; top-level nodes are an old-client fallback only. */
		function sessionNodes(snap) {
			const official = snap?.chat?.legacy?.nodes;
			if (Array.isArray(official)) return official;
			return Array.isArray(snap?.nodes) ? snap.nodes : [];
		}
		function createWorkbenchSessionMonitor(options) {
			const api = options.api;
			const pinParentSessionId = options.pinParentSessionId;
			const readSessionListSnap = options.readSessionListSnap;
			const snapshotOf = options.snapshotOf;
			const prepareTransaction = options.prepareTransaction;
			const commitTransaction = options.commitTransaction;
			const transactionCanRun = options.transactionCanRun;
			const settleTransaction = options.settleTransaction;
			const destroyTransaction = options.destroyTransaction;
			const setTransactionPaused = options.setTransactionPaused || (() => {});
			const requirementsPending = options.requirementsPending || (() => false);
			const onChange = options.onChange || (() => {});
			const setIntervalFn = options.setIntervalFn || ((callback, delay) => setInterval(callback, delay));
			const clearIntervalFn = options.clearIntervalFn || ((timer) => clearInterval(timer));
			const tickMs = options.tickMs || 15e3;
			return {
				state: {
					cwd: "",
					module: "tender",
					projectId: "",
					parentSessionId: "",
					monitoring: false,
					paused: false,
					lastCheck: 0,
					note: "",
					settlementCheckPending: false,
					observedExecutionActive: false,
					done: false,
					lastReality: null,
					lastControl: null,
					lastRealityDigest: ""
				},
				sending: false,
				timer: null,
				emit() {
					onChange();
				},
				start(target) {
					const previousTarget = `${this.state.parentSessionId}\n${this.state.cwd}\n${this.state.module}\n${this.state.projectId}`;
					if (target && target.cwd && target.projectId) {
						this.state.cwd = target.cwd;
						this.state.module = target.module || "tender";
						this.state.projectId = target.projectId;
					}
					if (!this.state.cwd || !this.state.projectId) return;
					const parentSessionId = pinParentSessionId();
					if (!parentSessionId) throw new Error("请先打开主会话，再启动自动推进。");
					if (previousTarget !== `${parentSessionId}\n${this.state.cwd}\n${this.state.module}\n${this.state.projectId}`) {
						this.state.lastRealityDigest = "";
						this.state.observedExecutionActive = false;
					}
					if (prepareTransaction(parentSessionId, {
						cwd: this.state.cwd,
						module: this.state.module,
						projectId: this.state.projectId
					}).phase === "prepared") commitTransaction(parentSessionId);
					setTransactionPaused(parentSessionId, false);
					this.state.monitoring = true;
					this.state.paused = false;
					this.state.done = false;
					this.state.parentSessionId = parentSessionId;
					this.state.note = "本轮已显式派发；工作台只观察 DSH，空闲后核对一次，不会自动派活。";
					this.state.settlementCheckPending = true;
					this.state.observedExecutionActive = false;
					this.ensureTimer();
					this.emit();
				},
				restore(target, parentSessionId, paused = false) {
					if (!target || !target.cwd || !target.projectId || !parentSessionId) return false;
					if (!transactionCanRun(parentSessionId)) return false;
					this.state.cwd = target.cwd;
					this.state.module = target.module || "tender";
					this.state.projectId = target.projectId;
					this.state.parentSessionId = parentSessionId;
					this.state.monitoring = true;
					this.state.paused = Boolean(paused);
					this.state.done = false;
					this.state.note = paused ? "已恢复本会话监控；保持暂停。" : "已恢复本会话监控；不会自动派活。";
					this.state.settlementCheckPending = false;
					this.state.observedExecutionActive = false;
					this.ensureTimer();
					this.emit();
					return true;
				},
				pause() {
					this.state.paused = true;
					setTransactionPaused(this.state.parentSessionId, true);
					this.emit();
				},
				unpause() {
					if (!this.state.monitoring) return;
					this.state.paused = false;
					setTransactionPaused(this.state.parentSessionId, false);
					if (!this.state.parentSessionId) this.state.parentSessionId = pinParentSessionId();
					this.emit();
				},
				stop(note, outcome) {
					const parentId = this.state.parentSessionId;
					if (parentId && outcome === "succeeded") settleTransaction(parentId, "succeeded");
					else if (parentId && outcome === "failed") settleTransaction(parentId, "failed", note);
					setTransactionPaused(parentId, false);
					this.state.monitoring = false;
					if (note) this.state.note = note;
					if (this.timer) {
						clearIntervalFn(this.timer);
						this.timer = null;
					}
					this.emit();
				},
				ensureTimer() {
					if (this.timer) return;
					this.timer = setIntervalFn(() => {
						this.tick();
					}, tickMs);
				},
				tick() {
					const state = this.state;
					if (!state.monitoring || state.paused || !state.cwd || !state.projectId) return void 0;
					if (!state.parentSessionId) state.parentSessionId = pinParentSessionId();
					const parentId = state.parentSessionId;
					if (!transactionCanRun(parentId)) {
						this.stop("自动推进事务未提交或已结束；请在工作台重新点「继续推进」。");
						return;
					}
					const parentSnap = snapshotOf(parentId);
					if (parentSnap && parentSnap.removed === true) {
						destroyTransaction(parentId);
						this.stop("主会话已销毁，自动推进事务同时结束。");
						return;
					}
					if (requirementsPending(parentId)) {
						state.lastCheck = Date.now();
						state.note = "用户最新要求正在写入项目账本，自动推进等待落账。";
						this.emit();
						return;
					}
					const sessionList = readSessionListSnap();
					const executionActive = sessionExecutionActive(parentSnap, sessionList, parentId);
					const runningChildren = sessionActivity(sessionList, parentId).runningChildCount;
					state.lastCheck = Date.now();
					if (executionActive) {
						state.observedExecutionActive = true;
						state.note = runningChildren > 0 ? `${runningChildren} 个 DSH 子智能体仍在执行；工作台只观察，不插话。` : "DSH 主智能体正在执行；工作台只观察，不插话。";
						this.emit();
						return;
					}
					if (this.sending) {
						this.emit();
						return;
					}
					if (!state.settlementCheckPending && !state.observedExecutionActive) return void 0;
					state.settlementCheckPending = false;
					state.observedExecutionActive = false;
					this.sending = true;
					return api("/api/agent-pi/stage", state.cwd, {
						method: "POST",
						body: JSON.stringify({
							action: "check",
							module: state.module,
							projectId: state.projectId,
							sessionId: parentId
						})
					}).then((checked) => {
						if (checked && checked.reality) {
							state.lastReality = checked.reality;
							state.lastControl = checked.control || null;
							this.emit();
						}
						const realityDigest = String(checked && checked.control && checked.control.realityDigest || "");
						const unchanged = Boolean(realityDigest && realityDigest === state.lastRealityDigest);
						if (realityDigest) state.lastRealityDigest = realityDigest;
						this.stop(unchanged ? "本轮 DSH 已空闲，项目事实未变化；继续下一步需再次点击「继续推进」。" : "本轮 DSH 已空闲，工作台已核对一次盘面；继续下一步需再次点击「继续推进」。", "succeeded");
					}).catch((error) => {
						this.stop(String(error && error.message || error), "failed");
					}).finally(() => {
						this.sending = false;
					});
				}
			};
		}
		//#endregion
		//#region src/client/workbench-view.js
		function createWorkbenchView(dependencies) {
			const h = dependencies.h;
			const Icon = dependencies.Icon;
			const tAp = dependencies.tAp;
			const workbenchText = dependencies.workbenchText || ((value) => value);
			const moduleIconNode = dependencies.moduleIconNode;
			const moduleLabel = dependencies.moduleLabel;
			const FilePickPanel = dependencies.FilePickPanel;
			return function WorkbenchView(props) {
				const specialModule = props.module === "kb" || props.module === "modules" || props.module === "archive";
				let body = props.specialContent;
				if (!specialModule) body = props.projects.length === 0 && !props.error ? h("div", { className: "ap-landing" }, h("div", { className: "ap-landing-inner" }, moduleIconNode(props.current, 32), h("h1", null, props.current ? moduleLabel(props.current) : tAp("workbench.title")), h("p", null, tAp("wb.landing")), h("div", { className: "ap-landing-actions" }, h("button", {
					type: "button",
					className: "ap-btn",
					disabled: !props.cwd || props.current?.available === false,
					onClick: props.onAdopt
				}, Icon("layout", 16), tAp("wb.upgrade")), h("button", {
					type: "button",
					className: "ap-btn primary",
					disabled: props.current?.available === false,
					onClick: props.onCreate
				}, Icon("plus", 16), tAp("wb.create"))))) : h("div", { className: "ap-ov" }, h("aside", { className: "ap-col" }, h("div", { className: "ap-col-hd" }, tAp("wb.projects")), props.projects.map((item) => h("button", {
					key: item.project.projectId,
					type: "button",
					className: "ap-proj" + (item.project.projectId === props.selectedId ? " on" : ""),
					onClick: () => props.onSelectProject(item.project.projectId)
				}, h("strong", null, item.project.name), h("em", null, item.project.projectId)))), props.overview || h("div", { className: "ap-landing" }, h("p", { className: "ap-sub" }, tAp("wb.pickProject"))));
				return h("div", { className: "ap-wb" }, h("header", { className: "ap-hdr" }, h("h1", null, tAp("workbench.title")), h("div", {
					className: "ap-path",
					title: props.cwd
				}, Icon("folder", 14), h("span", null, props.cwd || tAp("wb.noCwd"))), props.onClose ? h("div", {
					className: "ap-actions",
					style: { marginTop: 10 }
				}, h("button", {
					type: "button",
					className: "ap-btn",
					onClick: props.onClose
				}, tAp("wb.back"))) : null), h("div", { className: "ap-toolbar" }, h("div", { className: "ap-mods" }, props.catalog.map((item) => h("button", {
					key: item.id,
					type: "button",
					className: "ap-mod" + (props.module === item.id ? " on" : ""),
					onClick: () => props.onSelectModule(item.id)
				}, moduleIconNode(item, 15), moduleLabel(item))), props.capabilities?.knowledge === false ? null : h("button", {
					type: "button",
					className: "ap-mod" + (props.module === "kb" ? " on" : ""),
					title: tAp("wb.kbTitle"),
					onClick: () => props.onSelectModule("kb")
				}, Icon("book", 15), tAp("wb.kb")), props.capabilities?.workbench === false ? null : h("button", {
					type: "button",
					className: "ap-mod" + (props.module === "modules" ? " on" : ""),
					title: tAp("wb.modulesTitle"),
					onClick: () => props.onSelectModule("modules")
				}, Icon("settings", 15), tAp("wb.modules")), h("button", {
					type: "button",
					className: "ap-mod" + (props.module === "archive" ? " on" : ""),
					title: tAp("archive.lead"),
					onClick: () => props.onSelectModule("archive")
				}, Icon("archive", 15), tAp("archive.title"))), specialModule ? null : h("div", { className: "ap-actions" }, h("button", {
					type: "button",
					className: "ap-btn",
					onClick: props.onRefresh
				}, Icon("refresh", 14, props.refreshing ? "ap-spin" : ""), tAp("wb.refresh")), h("button", {
					type: "button",
					className: "ap-btn",
					disabled: !props.cwd || props.current?.available === false,
					title: tAp("wb.adoptTitle"),
					onClick: props.onAdopt
				}, Icon("layout", 14), tAp("wb.adopt")), h("button", {
					type: "button",
					className: "ap-btn primary",
					disabled: props.current?.available === false,
					onClick: props.onCreate
				}, Icon("plus", 14), tAp("wb.create")))), props.moduleErrorCount ? h("div", {
					className: "ap-err",
					style: { padding: "8px 24px 0" }
				}, tAp("wb.moduleErrors", { n: props.moduleErrorCount })) : null, props.error ? h("div", {
					className: "ap-err",
					style: { padding: "8px 24px 0" }
				}, props.error) : null, body, props.picking ? h("div", {
					className: "ap-overlay",
					onClick: (event) => {
						if (event.target === event.currentTarget) props.onClosePicker();
					}
				}, h("div", { className: "ap-modal wide" }, h("h1", null, Icon("filePlus", 18), workbenchText("添加资料")), h("p", { className: "hint" }, workbenchText("仅限用户明确登记的文件。企业工效表可一起登记，有则优先于网络调研。")), h(FilePickPanel, {
					cwd: props.cwd,
					selected: props.pickSelected,
					onToggle: props.onTogglePick
				}), h("div", { className: "ap-foot" }, h("button", {
					type: "button",
					className: "ap-btn",
					onClick: props.onClosePicker
				}, workbenchText("取消")), h("button", {
					type: "button",
					className: "ap-btn primary",
					disabled: props.busy === "files",
					onClick: props.onSaveFiles
				}, workbenchText("保存登记"))))) : null);
			};
		}
		//#endregion
		//#region src/client/styles.js
		const clientCss = `
:root, html{
  --ap-accent: oklch(0.64 0.13 205);
  --ap-success: oklch(0.60 0.16 165);
  --ap-destructive: oklch(0.55 0.22 27);
  --ap-info: oklch(0.74 0.15 118);
}
body[data-ds-dark-theme]{
  --ap-accent: oklch(0.73 0.14 205);
  --ap-success: oklch(0.68 0.14 165);
  --ap-destructive: oklch(0.68 0.18 27);
}
.ap-wb{
  height:100%;overflow:auto;box-sizing:border-box;
  display:flex;flex-direction:column;min-height:0;
  color:var(--dsw-alias-label-primary);
  background:var(--dsw-alias-bg-layer-1);
  font-size:13px;line-height:1.45;
}
.ap-icon{display:inline-block;flex-shrink:0;vertical-align:-0.125em}
.ap-hdr{border-bottom:1px solid var(--dsw-alias-border-l1);padding:20px 24px 16px;flex-shrink:0}
.ap-hdr h1{font-size:17px;font-weight:600;margin:0;letter-spacing:-0.01em}
.ap-path{margin-top:6px;display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-tertiary);font-size:12px;min-width:0}
.ap-path span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:10px 24px;border-bottom:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb, var(--dsw-alias-label-primary) 3%, var(--dsw-alias-bg-layer-1));flex-shrink:0}
.ap-mods{display:flex;flex-wrap:wrap;gap:4px}
.ap-mod{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;font-weight:500}
.ap-mod:hover{color:var(--dsw-alias-label-primary);background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent)}
.ap-mod.on{color:var(--ap-accent);background:color-mix(in srgb, var(--ap-accent) 12%, transparent)}
.ap-actions{display:flex;gap:8px;flex-wrap:wrap}
.ap-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 11px;cursor:pointer;font-size:12px;font-weight:500}
.ap-btn:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, var(--dsw-alias-bg-base))}
.ap-btn.primary{background:color-mix(in srgb, var(--ap-accent) 16%, var(--dsw-alias-bg-base));border-color:color-mix(in srgb, var(--ap-accent) 40%, var(--dsw-alias-border-l2));color:var(--ap-accent)}
.ap-btn.primary:hover{background:color-mix(in srgb, var(--ap-accent) 22%, var(--dsw-alias-bg-base))}
.ap-btn.warn{color:var(--ap-destructive);border-color:color-mix(in srgb, var(--ap-destructive) 35%, var(--dsw-alias-border-l2))}
.ap-body{padding:20px 24px 40px}
.ap-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:16px 18px;margin:0 0 12px;background:var(--dsw-alias-bg-base)}
.ap-card-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.ap-card-hd h2{font-size:15px;font-weight:600;margin:0}
.ap-sub{color:var(--dsw-alias-label-tertiary);font-size:12px;margin-top:4px}
.ap-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.ap-chip{font-size:10px;font-weight:500;padding:2px 8px;border-radius:6px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);color:var(--dsw-alias-label-secondary)}
.ap-chip.warn{background:color-mix(in srgb, var(--ap-destructive) 12%, transparent);color:var(--ap-destructive)}
.ap-chip.ok{background:color-mix(in srgb, var(--ap-success) 12%, transparent);color:var(--ap-success)}
.ap-chip.live{background:color-mix(in srgb, var(--ap-accent) 12%, transparent);color:var(--ap-accent)}
.ap-stages{display:flex;align-items:center;gap:4px;overflow-x:auto;border-bottom:1px solid var(--dsw-alias-border-l1);margin:14px -18px 0;padding:0 18px}
.ap-stage{flex-shrink:0;height:32px;white-space:nowrap;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-tertiary);padding:0 10px;cursor:pointer;font-size:12px}
.ap-stage:hover{color:var(--dsw-alias-label-primary)}
.ap-stage.on{border-bottom-color:var(--ap-accent);color:var(--dsw-alias-label-primary);font-weight:600}
.ap-stage.done{color:var(--ap-success)}
.ap-stage.blocked{color:var(--ap-destructive)}
.ap-gap{font-size:12px;color:var(--dsw-alias-label-secondary);margin:6px 0;display:flex;align-items:flex-start;gap:8px}
.ap-task{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;padding:6px 0;border-top:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.ap-task:first-of-type{border-top:0}
.ap-bar{height:6px;border-radius:999px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);overflow:hidden;margin:8px 0 4px}
.ap-bar>i{display:block;height:100%;background:var(--ap-accent);border-radius:999px;transition:width .3s ease}
.ap-bar.fail>i{background:var(--ap-destructive)}
.ap-kb-ok{padding:8px 12px;border-radius:8px;background:color-mix(in srgb, var(--ap-success) 14%, transparent);color:var(--ap-success);font-size:12px;margin:8px 0}
.ap-kb-files{display:flex;flex-direction:column;gap:8px;margin-top:10px}
.ap-kb-file{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base)}
.ap-kb-file-ico{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb, var(--ap-accent) 12%, transparent);color:var(--ap-accent);flex-shrink:0}
.ap-kb-file-ico.warn{background:color-mix(in srgb, var(--ap-destructive) 12%, transparent);color:var(--ap-destructive)}
.ap-kb-file-ico.ok{background:color-mix(in srgb, var(--ap-success) 12%, transparent);color:var(--ap-success)}
.ap-kb-file-main{min-width:0;flex:1}
.ap-kb-file-main strong{display:block;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-kb-file .ap-bar{margin:6px 0 2px}
.ap-kb-drop{outline:2px dashed color-mix(in srgb, var(--ap-accent) 55%, transparent);outline-offset:4px;border-radius:12px}
.ap-kb-paths{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:10px 0 12px}
@media (max-width: 1100px){.ap-kb-paths{grid-template-columns:1fr}}
.ap-kb-path{padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 3%, var(--dsw-alias-bg-base))}
.ap-kb-path strong{display:block;font-size:13px;margin-bottom:4px}
.ap-kb-path p{margin:0;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary)}
.ap-kb-path p + p{margin-top:8px}
.ap-kb-say{margin-top:8px;padding:8px 10px;border-radius:8px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-primary);background:color-mix(in srgb, var(--ap-accent) 10%, var(--dsw-alias-bg-base))}
.ap-kb-folder{margin:8px 0 4px;padding:2px 0 2px 12px;border-left:2px solid color-mix(in srgb, var(--ap-accent) 40%, var(--dsw-alias-border-l2))}
.ap-kb-folder-hd{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:2px 0 4px}
.ap-kb-home{font:inherit;font-size:12px;max-width:148px;padding:2px 6px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:inherit}
.ap-kb-skills{display:flex;flex-direction:column;gap:8px;margin-top:10px}
.ap-kb-skill{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base)}
.ap-kb-skill-ico{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb, var(--ap-accent) 12%, transparent);color:var(--ap-accent);flex-shrink:0}
.ap-kb-skill-main{min-width:0;flex:1}
.ap-kb-skill-hd{display:flex;align-items:center;justify-content:space-between;gap:10px}
.ap-kb-skill-hd strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.ap-kb-skill-desc{margin:4px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.ap-kb-skill .ap-chip{display:inline-block;max-width:100%;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-split{display:flex;flex:1;min-height:0}
.ap-col{width:280px;flex:none;border-right:1px solid var(--dsw-alias-border-l1);overflow:auto;background:color-mix(in srgb, var(--dsw-alias-label-primary) 3%, var(--dsw-alias-bg-layer-1))}
.ap-col-hd{padding:12px 14px 6px;font-size:11px;font-weight:650;letter-spacing:.06em;color:var(--dsw-alias-label-tertiary)}
.ap-col-empty{padding:4px 14px 10px;font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.45}
.ap-proj{display:block;width:100%;border:0;border-left:2px solid transparent;background:transparent;text-align:left;padding:8px 14px;cursor:pointer;color:inherit}
.ap-proj:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent)}
.ap-proj.on{background:color-mix(in srgb, var(--ap-accent) 12%, transparent);border-left-color:var(--ap-accent)}
.ap-proj strong{display:block;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-proj em{display:block;font-style:normal;font-size:11px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}
.ap-sess{display:flex;align-items:center;gap:6px;width:100%;border:0;background:transparent;text-align:left;padding:5px 14px 5px 22px;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px;min-width:0}
.ap-sess:hover{color:var(--dsw-alias-label-primary);background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent)}
.ap-sess.on{color:var(--ap-accent)}
.ap-sess span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-main{flex:1;min-width:0;overflow:auto}
.ap-landing{display:flex;min-height:calc(100% - 40px);align-items:center;justify-content:center;padding:40px 24px}
.ap-landing-inner{display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;max-width:520px}
.ap-landing-inner h1{font-size:17px;margin:0;font-weight:600}
.ap-landing-inner p{margin:0;font-size:13px;color:var(--dsw-alias-label-tertiary)}
.ap-landing-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:4px}
.ap-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb, var(--dsw-alias-bg-layer-1) 55%, transparent);pointer-events:auto;z-index:40}
.ap-modal{width:min(480px,92vw);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:16px;padding:22px 24px;pointer-events:auto;box-shadow:0 16px 48px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent)}
.ap-modal h1{font-size:16px;margin:0 0 4px;display:flex;align-items:center;gap:8px}
.ap-modal .hint{font-size:12px;color:var(--dsw-alias-label-tertiary);margin:0 0 16px}
.ap-modal label{display:block;font-size:12px;font-weight:500;margin:8px 0 2px;color:var(--dsw-alias-label-secondary)}
.ap-wb input,.ap-wb select,.ap-modal input,.ap-modal select{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:8px;padding:8px 10px;font-size:13px}
.ap-kb-pick{position:relative;display:inline-flex;align-items:center}
.ap-kb-pick input[type=file]{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;font-size:16px;padding:0;border:0}
.ap-wb input[type=file],.ap-kb-native{display:block !important;width:auto !important;max-width:100%;margin-top:8px;padding:8px 10px !important;cursor:pointer}
.ap-err{color:var(--ap-destructive);font-size:12px;white-space:pre-wrap;margin:8px 0}
.ap-draft{white-space:pre-wrap;font:var(--dsw-font-markdown-code-block-small);background:var(--dsw-alias-markdown-code-block);padding:10px;border-radius:8px;max-height:180px;overflow:auto}
.ap-spin{animation:ap-spin 0.8s linear infinite}
@keyframes ap-spin{to{transform:rotate(360deg)}}
.ap-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.ap-codex-settings{max-width:760px;padding:24px;color:var(--dsw-alias-label-primary)}
.ap-codex-settings h1{font-size:18px;margin:0 0 6px}
.ap-codex-lead{margin:0 0 18px;color:var(--dsw-alias-label-secondary);line-height:1.65}
.ap-codex-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:18px;background:var(--dsw-alias-bg-base)}
.ap-codex-status{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
.ap-codex-status strong{font-size:14px}
.ap-codex-note{margin:14px 0 0;padding:12px;border-radius:9px;background:color-mix(in srgb, var(--ap-accent) 8%, var(--dsw-alias-bg-base));color:var(--dsw-alias-label-secondary);line-height:1.6}
.ap-codex-note code{color:var(--ap-accent)}
:root{--ap-files-w:300px}
.ap-files-dock{
  position:fixed;top:0;inset-inline-end:0;bottom:0;width:var(--ap-files-w);
  pointer-events:auto;z-index:21;
  border-inline-start:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-layer-1);
  box-shadow:-8px 0 24px color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);
}
.ap-files-resizer{
  position:absolute;inset-inline-start:-4px;top:0;bottom:0;width:10px;z-index:4;
  cursor:col-resize;touch-action:none;
}
.ap-files-resizer::after{
  content:'';position:absolute;top:18%;bottom:18%;left:4px;width:3px;border-radius:999px;
  background:var(--dsw-alias-border-l2);opacity:.75;
}
.ap-files-resizer:hover::after,
.ap-files-dock.resizing .ap-files-resizer::after{
  background:var(--ap-accent,#0f8a8a);opacity:1;
}
.ap-files-dock.collapsed .ap-files-resizer{display:none}
html.ap-rail-resizing{cursor:col-resize;user-select:none}
[data-side="sidebar"]{
  z-index:40!important;width:10px;margin-left:-5px;
}
[data-side="sidebar"]::after{
  content:'';position:absolute;top:16%;bottom:16%;left:3px;width:3px;border-radius:999px;
  background:var(--dsw-alias-border-l2);opacity:.85;
}
[data-side="sidebar"]:hover::after,
[data-side="sidebar"][data-dragging]::after{
  background:var(--ap-accent,#0f8a8a);opacity:1;
}
.ap-files-dock .ap-files{height:100%}
.ap-files-dock.collapsed{width:56px;box-shadow:none}
.ap-files-dock.collapsed .ap-files-tree,
.ap-files-dock.collapsed .ap-err,
.ap-files-dock.collapsed .ap-files-hd strong{display:none}
.ap-files-dock.collapsed .ap-files-hd{
  flex-direction:column;flex:1;height:100%;border:0;padding:18px 10px 10px;align-items:center;
}
.ap-files-dock.collapsed .ap-files-hd .ap-row{
  flex-direction:column;flex:1;width:100%;justify-content:flex-start;align-items:center;gap:8px;
}
.ap-files-dock.collapsed .ap-files-hd .ap-toolbtn{width:36px;height:36px}
.ap-files-dock.collapsed .ap-files-toggle{margin-top:auto}
html.ap-files-rail [data-phase="hero"],
html.ap-files-rail [data-phase="active"],
html.ap-files-rail [data-phase="settling"]{margin-inline-end:var(--ap-files-w)}
html.ap-files-rail.ap-files-collapsed [data-phase="hero"],
html.ap-files-rail.ap-files-collapsed [data-phase="active"],
html.ap-files-rail.ap-files-collapsed [data-phase="settling"]{margin-inline-end:56px}
html.ap-wb-open [data-shell-overlay]{z-index:20}
.ap-wb-page{
  position:absolute;top:0;inset-inline-end:0;bottom:0;pointer-events:auto;z-index:6;
  background:var(--dsw-alias-bg-layer-1);
  border-inline-start:1px solid var(--dsw-alias-border-l1);
  overflow:auto;
}
html.ap-files-rail .ap-wb-page{inset-inline-end:var(--ap-files-w)}
html.ap-files-rail.ap-files-collapsed .ap-wb-page{inset-inline-end:56px}
@media(max-width:760px){
  html.ap-wb-open .ap-files-dock{display:none}
  html.ap-files-rail .ap-wb-page{inset-inline-end:0}
  .ap-wb .ap-ov-hd,.ap-wb .ap-mm-row{flex-wrap:wrap}
}
.ap-nav{
  display:flex;align-items:center;gap:8px;width:100%;height:36px;margin:0 0 6px;
  border:0;border-radius:8px;padding:0 10px;cursor:pointer;
  background:transparent;color:var(--dsw-alias-label-secondary);
  font-size:13px;font-weight:600;text-align:left;
}
.ap-nav:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);color:var(--dsw-alias-label-primary)}
.ap-nav.on{background:color-mix(in srgb, var(--ap-accent) 14%, transparent);color:var(--ap-accent)}
.ap-nav.rail{width:36px;height:36px;padding:0;margin:0 0 8px;justify-content:center}
.ap-nav-host,.ap-studio,.ap-pi{width:100%;flex:none}
.ap-arch-lead{margin:0 0 12px;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.ap-arch-group{margin:0 0 16px}
.ap-arch-group-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px}
.ap-arch-group-hd h3{margin:0;font-size:13px;font-weight:650}
.ap-arch-empty{margin:0 0 8px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.ap-arch-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;margin-bottom:8px;background:var(--dsw-alias-bg-base)}
.ap-arch-row strong{display:block;font-size:13px;font-weight:600}
.ap-arch-row .ap-sub{margin-top:2px}
.ap-arch-actions{display:flex;flex-wrap:wrap;gap:6px;flex:none}
[data-ap-archived-workspace]{display:none!important}
.ap-mount{flex:none;width:100%;display:flex;flex-direction:column;align-items:stretch}
html.ap-simple-nav [data-slot="sidebar"] *:has(> button:has(> svg[viewBox="0 0 182 24"])){
  height:auto!important;min-height:40px;justify-content:flex-end;overflow:visible!important;
}
html.ap-simple-nav [data-slot="sidebar"] button:has(> svg[viewBox="0 0 182 24"]){
  display:inline-flex!important;align-items:center;justify-content:flex-start;
  min-width:0;height:auto;padding:0 8px 0 0;overflow:hidden;
}
html.ap-simple-nav [data-slot="sidebar"] button:has(> svg[viewBox="0 0 182 24"]) svg{display:none!important}
html.ap-simple-nav [data-slot="sidebar"] button:has(> svg[viewBox="0 0 182 24"])::after,
html.ap-simple-nav [data-slot="sidebar"] button:has([class*="fallbackBrandName"])::after{
  content:"Agent Pi DSH";
  font-size:13px;font-weight:650;letter-spacing:-0.03em;line-height:1.3;
  color:var(--dsw-alias-label-primary);white-space:nowrap;
}
html.ap-simple-nav [data-slot="sidebar"] [class*="fallbackBrandName"],
html.ap-simple-nav [data-slot="sidebar"] [class*="buildRevision"]{display:none!important}
html.ap-simple-nav [data-slot="sidebar"] button[class*="brand"] svg[viewBox="0 0 23.16 17.04"]{display:none!important}
.ap-sidebar-brand-name{
  font-size:13px;font-weight:650;letter-spacing:-0.03em;line-height:1.3;
  color:var(--dsw-alias-label-primary);white-space:nowrap;
}
.ap-studio{text-align:center;padding:4px 2px 10px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.ap-pi{display:flex;align-items:center;justify-content:center;margin:8px 0 2px;padding:4px 4px 6px;background:transparent;box-sizing:border-box}
.ap-pi img{display:block;width:112px;max-width:100%;height:112px;max-height:112px;border-radius:50%;object-fit:contain;object-position:center;user-select:none;pointer-events:none}
.ap-pi.rail,[data-sidebar-collapsed] .ap-pi{width:36px;height:36px;margin:6px auto 4px;padding:0}
.ap-pi.rail img,[data-sidebar-collapsed] .ap-pi img{width:32px;height:32px;max-height:32px}
[data-sidebar-collapsed] #ap-mount-studio{display:none}
.ap-files{height:100%;display:flex;flex-direction:column;min-height:0;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;position:relative}
.ap-files-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 12px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-shrink:0}
.ap-files-hd strong{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.ap-files-hd .ap-row{gap:4px}
.ap-files-tree{flex:1;min-height:0;overflow:auto;padding:6px 8px 16px}
.ap-files-sec{font-size:11px;font-weight:650;color:var(--dsw-alias-label-tertiary);padding:10px 6px 4px}
.ap-files-empty{font-size:11px;color:var(--dsw-alias-label-tertiary);padding:4px 6px 8px;line-height:1.45}
.ap-tree-row{display:flex;align-items:center;gap:2px;min-width:0}
.ap-tree-btn{display:flex;align-items:center;gap:6px;flex:1;width:auto;min-width:0;border:0;background:transparent;color:inherit;text-align:left;padding:4px 6px;border-radius:6px;cursor:pointer;font-size:12px}
.ap-tree-btn:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent)}
.ap-tree-inject{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:0;border-radius:6px;background:color-mix(in srgb, var(--ap-accent) 14%, transparent);color:var(--ap-accent);cursor:pointer;padding:0}
.ap-tree-inject:hover{background:color-mix(in srgb, var(--ap-accent) 24%, transparent)}
.ap-tree-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-tree-kids{margin-left:12px;border-left:1px solid color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);padding-left:4px}
.ap-menu{position:fixed;z-index:2147483000;min-width:180px;padding:4px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);box-shadow:0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 16%, transparent)}
.ap-menu button{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:inherit;padding:7px 8px;border-radius:6px;cursor:pointer;font-size:12px;text-align:left}
.ap-menu button:hover{background:color-mix(in srgb, var(--ap-accent) 12%, transparent)}
.ap-toolbtn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0}
.ap-toolbtn:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);color:var(--ap-accent)}
.ap-toolbtn.on{color:var(--ap-accent, #0f8a8a);background:color-mix(in srgb, var(--ap-accent, #0f8a8a) 14%, transparent)}
.ap-toolbtn:disabled{opacity:.4;cursor:default}
.ap-codex-turn{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;cursor:pointer}
.ap-codex-turn:hover,.ap-codex-turn.on{color:var(--ap-accent);border-color:color-mix(in srgb,var(--ap-accent) 45%,var(--dsw-alias-border-l2));background:color-mix(in srgb,var(--ap-accent) 12%,transparent)}
.ap-codex-model-control{display:inline-flex;align-items:center;gap:4px;min-width:0}
.ap-codex-model-select{height:28px;max-width:210px;min-width:0;padding:0 6px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:11px}
.ap-codex-model-select:disabled{opacity:.55}
.ap-codex-model-setting{display:grid;gap:8px;margin-top:18px}
.ap-codex-model-setting label{font-weight:600;font-size:13px}
.ap-codex-model-setting .ap-codex-model-select{height:36px;max-width:100%;width:100%;font-size:13px}
.ap-codex-model-setting .ap-sub{margin:0}
.ap-header-tool{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:32px;height:32px;min-width:32px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:18px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer}
.ap-header-tool:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.ap-header-tool:disabled{opacity:.4;cursor:default}
.ap-mount.ap-mount-lang{width:auto;min-width:0;margin-inline-start:auto;flex:none}
.ap-lang-host{display:flex;align-items:center;min-width:0}
.ap-lang-host.rail,[data-sidebar-collapsed] #ap-mount-lang{display:none!important}
.ap-lang{
  display:inline-flex;align-items:center;justify-content:center;
  width:106px;max-width:clamp(82px,36vw,112px);height:28px;margin:0;padding:0 22px 0 8px;
  border:1px solid var(--dsw-alias-border-l2);border-radius:8px;
  background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);
  font-size:11px;font-weight:650;cursor:pointer;letter-spacing:.01em;
}
.ap-lang:hover{color:var(--dsw-alias-label-primary);background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent)}
html[dir="rtl"] .ap-lang{padding:0 8px 0 22px}
.ap-badge{position:absolute;top:-3px;right:-3px;min-width:14px;height:14px;padding:0 4px;border-radius:999px;background:var(--ap-accent);color:#fff;font-size:9px;line-height:14px;font-weight:700}
.ap-attach-host{min-width:0;padding:4px 12px 6px}
.ap-project-starter{display:flex;align-items:center;justify-content:space-between;gap:14px;box-sizing:border-box;width:min(100%,var(--dsh-composer-card-max-width,760px));margin:0 auto 10px;padding:12px 14px;border:1px solid color-mix(in srgb,var(--ap-accent) 24%,var(--dsw-alias-border-l2));border-radius:12px;background:color-mix(in srgb,var(--ap-accent) 7%,var(--dsw-alias-bg-base));color:var(--dsw-alias-label-primary)}
.ap-project-starter-copy{display:flex;flex-direction:column;gap:3px;min-width:0}
.ap-project-starter-copy strong{font-size:13px;font-weight:650}
.ap-project-starter-copy span{font-size:11px;line-height:1.45;color:var(--dsw-alias-label-tertiary)}
.ap-project-starter-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap;flex:none}
@media(max-width:760px){.ap-project-starter{align-items:flex-start;flex-direction:column}.ap-project-starter-actions{justify-content:flex-start}}
[data-slot="conversation.input.dock"]{
  display:flex!important;flex-direction:column;width:100%;min-width:0;visibility:visible!important;
}
[data-slot="conversation.input.dock"] .ap-attach-host{
  display:block!important;visibility:visible!important;opacity:1!important;
  max-width:var(--dsh-composer-card-max-width, 100%);
  margin:0 auto;
  padding:0 0 8px;
  position:relative;z-index:8;
}
.ap-composer-tools{display:flex;align-items:center;gap:8px;flex:none;min-width:max-content}
[data-slot="conversation.input.left"]{overflow:visible!important;flex:none;min-width:max-content}
.ap-attach-in-card{
  display:block!important;visibility:visible!important;opacity:1!important;
  width:100%;box-sizing:border-box;padding:8px 12px 0;min-height:0;
}
.ap-attach-in-card .ap-attach-host{padding:0}
.ap-attach-rail{display:flex;gap:8px;padding:0;overflow-x:auto;max-width:100%}
.ap-attach-bubble{position:relative;flex:none;display:flex;align-items:center;gap:8px;height:40px;max-width:240px;padding:0 12px 0 8px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin, color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent));border-radius:12px;background:var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, var(--dsw-alias-label-primary) 6%, var(--dsw-alias-bg-base)))}
.ap-attach-bubble.loading{opacity:.72}
.ap-attach-bubble.image{width:40px;height:40px;max-width:40px;padding:0;overflow:hidden}
.ap-attach-thumb{width:22px;height:22px;border-radius:6px;background:transparent;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none;color:var(--dsw-alias-state-business-primary, #2b6cb0)}
.ap-attach-bubble.image .ap-attach-thumb{width:40px;height:40px;border-radius:12px}
.ap-attach-thumb img{width:100%;height:100%;object-fit:cover}
.ap-attach-meta{display:flex;align-items:center;min-width:0;max-width:176px}
.ap-attach-meta strong{font-size:12px;font-weight:600;line-height:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.ap-attach-meta em{display:none}
.ap-attach-x{position:absolute;top:2px;right:2px;width:16px;height:16px;border:0;border-radius:999px;background:var(--dsw-alias-button-contrast-fill, color-mix(in srgb, var(--dsw-alias-label-primary) 70%, #000));color:var(--dsw-alias-label-primary-inverted, #fff);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:1}
.ap-toast{position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:90;padding:8px 12px;border-radius:8px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 88%, #000);color:#fff;font-size:12px;box-shadow:0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 20%, transparent)}
.ap-attach-float{
  position:fixed;z-index:2147482000;pointer-events:auto;
  box-sizing:border-box;padding:0 4px;
  visibility:visible!important;opacity:1!important;
}
.ap-attach-float .ap-attach-rail{
  padding:6px 8px;border-radius:12px;
  background:color-mix(in srgb, var(--dsw-alias-bg-base) 92%, transparent);
  box-shadow:0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);
}
.ap-switch{position:relative;width:36px;height:20px;flex:none;flex-shrink:0;border:1px solid color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent);border-radius:999px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 18%, var(--dsw-alias-bg-base));cursor:pointer;padding:0}
.ap-switch.on{background:var(--ap-accent, #0f8a8a);border-color:var(--ap-accent, #0f8a8a)}
.ap-switch-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:left .15s ease;pointer-events:none;display:block}
.ap-switch.on .ap-switch-knob{left:18px}
[data-slot="sidebar.workspaces"] [class*="rowActions"],
[data-slot="sidebar.workspaces"] [class*="iconButton"]{
  opacity:1!important;visibility:visible!important;color:#111827!important;
}
.ap-preview{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);z-index:2}
.ap-preview pre{flex:1;margin:0;padding:12px;overflow:auto;white-space:pre-wrap;font:var(--dsw-font-markdown-code-block-small)}
.ap-doc{position:fixed;inset:0;z-index:400;display:flex;flex-direction:column;pointer-events:auto;background:color-mix(in srgb, var(--dsw-alias-label-primary) 10%, var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary)}
html.ap-doc-open [data-shell-overlay]{z-index:400;pointer-events:auto}
.ap-doc-hd{height:48px;flex-shrink:0;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:0 12px;position:relative}
.ap-doc-path{position:absolute;left:50%;transform:translateX(-50%);min-width:0;max-width:min(280px,22vw);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:color-mix(in srgb, var(--dsw-alias-label-primary) 7%, var(--dsw-alias-bg-base));border-radius:8px;padding:6px 12px;font-size:12px;z-index:1;pointer-events:none}
.ap-doc-actions{display:flex;align-items:center;gap:4px;flex-shrink:0;position:relative;z-index:2}
.ap-doc-exports{display:inline-flex;align-items:center;gap:4px;margin-left:4px;padding-left:8px;border-left:1px solid color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent)}
.ap-doc-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:28px;min-width:28px;padding:0 8px;border:0;border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);font-size:12px;font-weight:500;cursor:pointer;opacity:.8}
.ap-doc-btn:hover{opacity:1}
.ap-doc-btn:disabled{opacity:.35;cursor:default}
.ap-doc-scroll{flex:1;min-height:0;overflow:auto;padding:40px 24px 80px}
.ap-doc-scroll.univer{padding:0;overflow:hidden;background:#fff;position:relative}
.ap-univer-frame{position:absolute;inset:0;display:block;width:100%;height:100%;border:0;background:#fff}
.ap-doc-scroll.cad{padding:0;overflow:hidden;background:#111827;position:relative}
.ap-cad-frame{position:absolute;inset:0;display:block;width:100%;height:100%;border:0;background:#111827}
.ap-doc-sheet{width:min(960px,100%);margin:0 auto;background:var(--dsw-alias-bg-base);border-radius:16px;padding:36px 44px 56px;box-shadow:0 18px 48px color-mix(in srgb, var(--dsw-alias-label-primary) 16%, transparent)}
.ap-doc-sheet.wide{width:min(1180px,100%);padding:28px 28px 40px}
.ap-doc-sheet h1{font-size:22px;line-height:1.3;margin:0 0 16px;font-weight:650}
.ap-doc-sheet h2{font-size:17px;margin:22px 0 10px;font-weight:650}
.ap-doc-sheet h3{font-size:15px;margin:18px 0 8px;font-weight:600}
.ap-doc-sheet p,.ap-doc-sheet li{font-size:14px;line-height:1.7;margin:0 0 10px}
.ap-doc-sheet ul,.ap-doc-sheet ol{margin:0 0 12px;padding-left:22px}
.ap-doc-sheet blockquote{border-left:4px solid var(--dsw-alias-border-l2);margin:0 0 12px;padding:0 12px;color:var(--dsw-alias-label-secondary)}
.ap-doc-sheet img{max-width:100%;height:auto;border-radius:8px;margin:8px 0}
.ap-doc-sheet hr{border:0;border-top:1px solid var(--dsw-alias-border-l2);margin:18px 0}
.ap-doc-sheet code{font:var(--dsw-font-markdown-code-block-small);background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);padding:1px 5px;border-radius:4px}
.ap-doc-sheet pre{white-space:pre-wrap;background:var(--dsw-alias-markdown-code-block);padding:12px;border-radius:8px;overflow:auto;font:var(--dsw-font-markdown-code-block-small)}
.ap-doc-sheet a{color:var(--ap-accent);word-break:break-all}
.ap-doc-sheet table{border-collapse:collapse;width:max-content;min-width:100%;margin:0;font-size:13px}
.ap-doc-sheet th,.ap-doc-sheet td{border:1px solid var(--dsw-alias-border-l2);padding:6px 8px;text-align:left}
.ap-doc-table-wrap{overflow:auto;max-width:100%;margin:0 0 14px}
.ap-doc-more{margin:8px 0 16px}
.ap-doc-edit{width:100%;min-height:56vh;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:12px 14px;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:var(--dsw-font-markdown-code-block-small);resize:vertical;line-height:1.65}
.ap-doc-toolbar{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 10px;position:sticky;top:0;z-index:2;padding:8px 0 10px;background:var(--dsw-alias-bg-base)}
.ap-fico-md{color:#0e7490}
.ap-fico-sheet{color:#217346}
.ap-fico-word{color:#2563eb}
.ap-fico-ppt{color:#ea580c}
.ap-fico-pdf{color:#dc2626}
.ap-fico-html{color:#7c3aed}
.ap-fico-img{color:#0284c7}
.ap-fico-json{color:#ca8a04}
.ap-fico-txt{color:#64748b}
.ap-fico-file{color:#94a3b8}
.ap-fico-folder{color:#d97706}
.ap-icon.ap-fico-md,.ap-icon.ap-fico-sheet,.ap-icon.ap-fico-word,.ap-icon.ap-fico-ppt,
.ap-icon.ap-fico-pdf,.ap-icon.ap-fico-html,.ap-icon.ap-fico-img,.ap-icon.ap-fico-json,
.ap-icon.ap-fico-txt,.ap-icon.ap-fico-file{border-radius:3px}
.ap-ai-sel{position:fixed;inset:0;z-index:500;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb, var(--dsw-alias-label-primary) 28%, transparent)}
.ap-ai-sel-card{width:min(520px,92vw);background:var(--dsw-alias-bg-base);border-radius:14px;padding:18px 20px 16px;box-shadow:0 18px 48px color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent)}
.ap-ai-sel-hd{display:flex;align-items:center;gap:8px;font-weight:650;margin:0 0 10px}
.ap-ai-sel-hd .ap-ai-sel-x{margin-left:auto}
.ap-ai-sel textarea{width:100%;min-height:110px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:10px 12px;box-sizing:border-box;background:color-mix(in srgb, var(--dsw-alias-label-primary) 4%, var(--dsw-alias-bg-base));color:var(--dsw-alias-label-primary);font:inherit;resize:vertical}
.ap-sheet{overflow:auto;max-width:100%;margin:0 0 16px}
.ap-sheet table{border-collapse:collapse;font-size:12px}
.ap-sheet th,.ap-sheet td{border:1px solid var(--dsw-alias-border-l2);padding:0}
.ap-sheet input{width:100%;min-width:72px;border:0;padding:5px 7px;background:transparent;color:inherit;font:inherit;box-sizing:border-box}
.ap-slide{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px 12px;margin:0 0 12px}
.ap-slide input,.ap-slide textarea{width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:6px 8px;margin:4px 0;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:inherit;font:inherit}
.ap-doc-toolbar .ap-doc-btn{height:26px;font-size:11px;opacity:1}
.ap-doc-btn.on{opacity:1;color:var(--ap-accent);box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--ap-accent) 55%, transparent)}
.ap-doc-wysiwyg{min-height:56vh;outline:none;caret-color:var(--ap-accent)}
.ap-doc-wysiwyg:empty:before{content:'开始编辑文档…';color:var(--dsw-alias-label-tertiary)}
.ap-doc-hint{font-size:11px;color:var(--dsw-alias-label-tertiary);margin:0 0 8px}
.ap-doc-img{display:block;max-width:100%;margin:0 auto;border-radius:8px}
.ap-doc-frame{width:100%;height:calc(100vh - 96px);border:0;background:var(--dsw-alias-bg-base);border-radius:12px}
.ap-doc-status{margin:0 0 14px;padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-tertiary)}
.ap-cite{display:inline-flex;align-items:center;gap:3px;max-width:100%;margin:0 2px;padding:0 6px;border-radius:999px;border:1px solid color-mix(in srgb, var(--ap-accent, #0f8a8a) 45%, transparent);background:color-mix(in srgb, var(--ap-accent, #0f8a8a) 8%, transparent);color:var(--ap-accent, #0f8a8a);font-size:11px;line-height:18px;font-family:var(--dsw-font-family-mono, ui-monospace, monospace);cursor:pointer;vertical-align:baseline;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ap-cite:hover{background:color-mix(in srgb, var(--ap-accent, #0f8a8a) 16%, transparent)}
.ap-cite-pop{position:fixed;right:24px;bottom:24px;z-index:520;width:min(420px,calc(100vw - 48px));display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:0 18px 48px color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent)}
.ap-cite-pop-hd{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px;min-width:0}
.ap-cite-pop-hd strong{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}
.ap-cite-pop-bd{padding:12px 14px;font-size:13px;line-height:1.65;font-family:inherit}
.ap-cite-pop-bd .crumb{font-size:11px;color:var(--dsw-alias-label-tertiary);margin:0 0 8px}
.ap-cite-pop-bd p{margin:0 0 6px}
.ap-audit{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;margin-top:8px}
.ap-audit.bad{border-color:color-mix(in srgb, #c2410c 55%, transparent);background:color-mix(in srgb, #c2410c 6%, transparent)}
.ap-audit ul{margin:6px 0 0;padding-left:18px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.ap-mod-emoji{font-size:15px;line-height:1;display:inline-block}
.ap-mm-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;margin-bottom:8px}
    .ap-mm-row.off{opacity:.55}
    .ap-mm-row strong{font-size:13px}
    .ap-mm-row .grow{flex:1;min-width:0}
    .ap-mm-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;margin-bottom:8px;overflow:hidden}
    .ap-mm-card.off{opacity:.55}
    .ap-mm-card .ap-mm-row{border:0;border-radius:0;margin:0}
    .ap-mm-stages{padding:8px 14px 12px 40px;border-top:1px solid var(--dsw-alias-border-l1)}
    .ap-mm-stage{display:flex;gap:8px;align-items:flex-start;padding:6px 0;font-size:12px}
    .ap-mm-stage strong{font-size:12px}
    .ap-mm-ed-stage{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;margin:10px 0}
    .ap-mm-field{display:block;margin-top:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}
    .ap-mm-field input,.ap-mm-field textarea,.ap-mm-field select{width:100%;margin-top:4px;padding:8px 10px;box-sizing:border-box;border-radius:8px;border:1px solid var(--dsw-border, rgba(127,127,127,.35));background:transparent;color:inherit;font:inherit}
    .ap-mm-field textarea{min-height:88px;resize:vertical}
    .ap-mm-field.tall textarea{min-height:140px}
    .ap-mm-checks{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;font-size:12px}
    .ap-create-lead{margin-top:8px;padding:12px 14px;border:1px solid color-mix(in srgb, var(--ap-accent) 28%, var(--dsw-alias-border-l1));border-radius:12px;background:color-mix(in srgb, var(--ap-accent) 7%, transparent)}
    .ap-create-lead strong{display:block;margin-bottom:4px}
    .ap-create-picks{display:grid;grid-template-columns:1fr;gap:10px;margin-top:12px}
    .ap-create-pick{display:block;width:100%;text-align:left;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:transparent;color:inherit;cursor:pointer}
    .ap-create-pick:hover{background:color-mix(in srgb, var(--ap-accent) 8%, transparent)}
    .ap-create-pick strong{display:block;font-size:13px;margin-bottom:4px}
    .ap-create-pick span{display:block;font-size:12px;line-height:1.45;color:var(--dsw-alias-label-tertiary)}
.ap-folder-row{display:flex;align-items:center;gap:8px;flex:1;min-width:0;width:auto;border:0;background:transparent;text-align:left;padding:8px 6px;border-radius:8px;cursor:pointer;font-size:14px;color:inherit}
.ap-folder-row:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent)}
.ap-btn.ghost{background:transparent;border-color:transparent}
.ap-btn.ghost:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent)}
.ap-btn.link{background:transparent;border:0;padding:4px 6px;color:var(--dsw-alias-label-secondary);font-weight:500}
.ap-btn.link:hover{color:var(--ap-accent);background:transparent}
.ap-btn:disabled{opacity:.4;cursor:default}
.ap-modal.wide{width:min(680px,94vw);max-height:86vh;overflow:auto}
.ap-steps{display:flex;gap:8px;border-bottom:1px solid var(--dsw-alias-border-l1);padding:0 0 10px;margin:0 0 14px}
.ap-steps span{flex:1;text-align:center;font-size:12px;color:var(--dsw-alias-label-tertiary);padding:0 0 8px;border-bottom:2px solid transparent}
.ap-steps span.on{color:var(--dsw-alias-label-primary);border-bottom-color:var(--ap-accent);font-weight:600}
.ap-mode{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 10px}
.ap-file-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:13px}
.ap-confirm p{margin:6px 0;font-size:13px}
.ap-confirm .k{color:var(--dsw-alias-label-tertiary)}
.ap-ov{display:flex;flex:1;min-height:0}
.ap-ov-main{flex:1;min-width:0;overflow:auto}
.ap-ov-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:20px 24px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.ap-ov-hd h1{font-size:20px;font-weight:650;margin:0;letter-spacing:-0.02em}
.ap-sec{padding:18px 24px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.ap-sec h2{font-size:13px;font-weight:650;margin:0}
.ap-user-reqs{display:flex;flex-direction:column;gap:10px;background:color-mix(in srgb,var(--ap-accent) 4%,transparent)}
.ap-user-req-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.ap-user-req{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base)}
.ap-user-req-main{display:flex;flex:1;flex-direction:column;gap:7px;min-width:0}
.ap-user-req-main p{margin:0;font-size:12px;line-height:1.55;overflow-wrap:anywhere}
.ap-user-req-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap;flex:none}
@media(max-width:760px){.ap-user-req-head,.ap-user-req{flex-direction:column}.ap-user-req-actions{justify-content:flex-start}}
.ap-mon-hd{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px}
.ap-mon-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.ap-dot{width:6px;height:6px;border-radius:999px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 28%, transparent);display:inline-block}
.ap-dot.on{background:var(--ap-accent);box-shadow:0 0 0 3px color-mix(in srgb, var(--ap-accent) 22%, transparent)}
.ap-dual-state{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin-top:14px}
.ap-state-card{min-width:0;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 96%,var(--ap-accent) 4%);overflow:hidden}
.ap-state-card-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:11px 12px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.ap-state-card-hd>div{display:flex;flex-direction:column;gap:3px;min-width:0}
.ap-state-card-hd strong{font-size:12px;font-weight:700}
.ap-state-body{display:flex;flex-direction:column;gap:7px;padding:11px 12px;font-size:12px;line-height:1.5}
.ap-state-body p{margin:0;overflow-wrap:anywhere}
.ap-state-empty{padding:16px 12px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.55}
.ap-mini-list{display:flex;flex-direction:column;gap:5px;padding-top:2px}
.ap-mini-list>div{display:flex;align-items:flex-start;gap:7px;min-width:0}
.ap-mini-list span{min-width:0;overflow-wrap:anywhere}
.ap-mini-status{width:7px;height:7px;margin-top:5px;border-radius:999px;flex:none;background:var(--dsw-alias-label-tertiary)}
.ap-mini-status.in_progress{background:var(--ap-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--ap-accent) 18%,transparent)}
.ap-mini-status.done{background:#1f9d68}
.ap-mini-status.blocked{background:#d97706}
.ap-state-alert{padding:7px 8px;border-radius:8px;background:color-mix(in srgb,#d97706 10%,transparent);color:color-mix(in srgb,#d97706 76%,var(--dsw-alias-label-primary))}
.ap-alignment-alert{margin-top:10px;padding:10px 12px;border:1px solid color-mix(in srgb,#d97706 30%,var(--dsw-alias-border-l1));border-radius:10px;background:color-mix(in srgb,#d97706 7%,transparent);font-size:12px}
.ap-alignment-alert ul{margin:5px 0 0;padding-left:18px;color:var(--dsw-alias-label-secondary)}
@media(max-width:920px){.ap-dual-state{grid-template-columns:1fr}}
.ap-check{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;margin:12px 0 4px;overflow:hidden}
.ap-check-hd{display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:12px;font-weight:600;border-bottom:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent)}
.ap-check-hd .ap-sub{font-weight:400;flex:1}
.ap-check-row{display:flex;align-items:baseline;gap:8px;padding:7px 12px;font-size:12px;border-top:1px solid var(--dsw-alias-border-l2)}
.ap-check-row:first-of-type{border-top:0}
.ap-check-row strong{font-weight:600;flex:none}
.ap-check-row .ap-sub{min-width:0}
.ap-check-row.bad{background:color-mix(in srgb, #c0392b 6%, transparent)}
.ap-check-row.bad .ap-sub{color:color-mix(in srgb, #c0392b 72%, var(--dsw-alias-label-primary))}
.ap-check-num{width:16px;flex:none;color:var(--dsw-alias-label-tertiary)}
.ap-stage-row{display:flex;align-items:flex-start;gap:14px;padding:14px 0;border-top:1px solid var(--dsw-alias-border-l2)}
.ap-stage-row:first-of-type{border-top:0}
.ap-stage-num{width:18px;flex:none;color:var(--dsw-alias-label-tertiary);font-size:13px;padding-top:2px}
.ap-stage-body{flex:1;min-width:0}
.ap-stage-body strong{display:block;font-size:13px;font-weight:600}
.ap-stage-hint{margin:4px 0 0;font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.45}
.ap-stage-acts{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none}
.ap-files-list button.ap-file-link{display:block;width:100%;border:0;background:transparent;text-align:left;padding:8px 0;font-size:13px;color:inherit;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-files-list button.ap-file-link:hover{color:var(--ap-accent)}
.ap-file-row{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ap-file-row .ap-file-link{width:auto;flex:1;min-width:0}
.ap-task-open{border:0;background:transparent;color:inherit;padding:0;text-align:left;cursor:pointer;min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:inherit}
.ap-task-open:hover{color:var(--ap-accent)}
.ap-tree-pick{max-height:220px;overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px;margin:8px 0}
.ap-tree-pick .ap-tree-btn.on{background:color-mix(in srgb, var(--ap-accent) 14%, transparent);color:var(--ap-accent)}
.ap-close{position:absolute;top:14px;right:14px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:4px;border-radius:6px}
.ap-close:hover{color:var(--dsw-alias-label-primary);background:color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent)}
.ap-modal{position:relative}
.ap-modal.wide h1{padding-right:32px}

[data-phase="hero"] svg[viewBox="0 0 182 24"],
[data-phase="hero"] svg[viewBox="0 0 23.16 17.04"],
button[class*="toggle"] > svg[viewBox="0 0 23.16 17.04"]{display:none!important}
[data-phase="hero"] button:has(> svg[viewBox="0 0 182 24"])::after{content:"Agent Pi DSH";font-size:15px;font-weight:650;letter-spacing:-0.02em}
button[class*="toggle"]:has(> svg[viewBox="0 0 23.16 17.04"])::before{content:"";width:22px;height:22px;background:url("/api/agent-pi/brand/symbol.png?v=8") center/contain no-repeat}
[data-phase="hero"] div:has(> span > svg[viewBox="0 0 23.16 17.04"]),
[data-phase="hero"] [class*="stack"] > [class*="headline"]:not([class*="Text"]){
  display:flex!important;justify-content:center!important;align-items:center!important;
  grid-template-columns:none!important;width:100%!important;min-height:188px;
  margin:0 0 8px;padding:0;position:relative;
  background:url("/api/agent-pi/brand/logo.png?v=8") center / contain no-repeat !important;
}
[data-phase="hero"] div:has(> span > svg[viewBox="0 0 23.16 17.04"]) > :not(.ap-hero-logo),
[data-phase="hero"] [class*="stack"] > [class*="headline"]:not([class*="Text"]) > :not(.ap-hero-logo){display:none!important}
[data-phase="hero"] div:has(> img.ap-hero-logo),
[data-phase="hero"] [class*="stack"] > [class*="headline"]:not([class*="Text"]):has(> img.ap-hero-logo){background:none!important}
.ap-hero-logo{display:block;width:min(360px,72vw);height:auto;max-height:200px;object-fit:contain;background:transparent}
[data-plugin-entry]{color:#111827!important}
[data-plugin-entry] button{color:#111827!important;-webkit-text-fill-color:#111827!important}
[data-plugin-entry] strong{
  color:#111827!important;-webkit-text-fill-color:#111827!important;
  font-size:14px!important;line-height:20px!important;font-weight:600!important;
  display:block!important;flex:1 1 auto!important;min-width:48px!important;
  opacity:1!important;visibility:visible!important;overflow:hidden!important;
  text-overflow:ellipsis!important;white-space:nowrap!important;z-index:2!important
}
[data-plugin-entry] strong:empty::before{content:attr(title);color:#111827;-webkit-text-fill-color:#111827}
[data-plugin-entry] [data-enabled]{opacity:1!important;visibility:visible!important}
[data-cordis-plugin-id]{color:#111827!important}
`;
		//#endregion
		//#region src/client/locales/professional-depth.js
		const en = {
			"实际用途与受众": "Purpose and audience",
			"成果用于什么工作、给谁使用或支持什么决策": "What work, audience or decision will this deliverable support?",
			"专业深度": "Professional depth",
			"需要说明、分析、计算，还是可执行的交付成果": "Is an explanation, analysis, calculation or ready-to-use deliverable needed?",
			"事实依据与缺口": "Evidence and gaps",
			"已知事实、所选资料、需要补充的关键条件": "Known facts, selected sources and critical missing conditions",
			"成果格式": "Deliverable format",
			"文件类型、模板、结构、图表与版式要求": "File type, template, structure, charts and layout",
			"验收口径": "Acceptance criteria",
			"怎样判断任务已满足实际使用需求": "How will this task be judged fit for its intended use?",
			"专业审阅": "Professional review",
			"文件与格式": "File and format",
			"包含指定内容": "Contains required content",
			"有效 JSON": "Valid JSON",
			"已启用": "Enabled",
			" · 已启用": " · Enabled",
			"查看任务说明和交付检查": "View task brief and delivery checks",
			"按实际用途研判任务、格式和验收要求": "Define task purpose, format and acceptance criteria",
			"专业深度任务说明": "Professional-depth task brief",
			"关闭专业深度面板": "Close professional-depth panel",
			"围绕实际用途、专业依据和交付要求，继续在当前 DSH 对话中完成任务。只使用你在本对话选定的知识库资料。": "Continue this task in the current DSH conversation using its purpose, professional basis and delivery requirements. Use only the knowledge-base sources selected for this conversation.",
			"已启用 · 等待你的任务输入": "Enabled · Awaiting your task",
			"任务说明 · 第 ": "Task brief · Revision ",
			" 版": "",
			"默认关闭": "Off by default",
			"关闭专业深度": "Turn off professional depth",
			"启用专业深度": "Turn on professional depth",
			"编辑任务说明": "Edit task brief",
			"开启只保存选择，不发送消息。输入并发送实际任务后，明确需求直接执行，关键目标不清楚时再集中询问；新对话默认关闭。": "Turning this on saves your choice without sending a message. After you submit the task, clear requirements can be acted on; only material uncertainty prompts a focused question. New conversations start with this off.",
			"可复用模板": "Reusable templates",
			"由你主动保存、选用。不会自动保存经验、扫描项目或向新对话加载模板。保存前请去掉本次项目事实。": "Save and select templates yourself. The app does not automatically collect experience, scan projects or load templates into new conversations. Remove project-specific facts before saving.",
			"选用专业深度模板": "Select a professional-depth template",
			"不使用模板": "No template",
			"整理并保存为模板": "Save as template",
			"查看已选模板": "View selected template",
			"模板名称": "Template name",
			"例如：施工方案审阅": "For example: Construction method review",
			"模板内容": "Template content",
			"保存模板": "Save template",
			"取消": "Cancel",
			"已保存 Markdown 模板：": "Markdown template saved: ",
			"。本次未自动选用。": ". It was not selected automatically.",
			"载入最新版本": "Load latest version",
			"发送任务后，由当前智能体结合实际需求整理。": "The agent will prepare this after you submit the task.",
			"验收项与交付检查": "Acceptance items and delivery checks",
			"文件检查仅证明所列条件。专业准确性、计算和视觉版式需结合实际证据审阅；检查结果记录当时的文件内容。": "File checks verify only the listed conditions. Review professional accuracy, calculations and layout against actual evidence. Check results reflect the file contents at the time.",
			"验收项 ": "Acceptance item ",
			"具体的验收条件": "Specific acceptance condition",
			"检查方式 ": "Check method ",
			"文件路径 ": "File path ",
			"相对于当前工作区的文件路径": "Path relative to the current workspace",
			"预期内容 ": "Expected content ",
			"必须包含的实际文本": "Required text",
			"移除": "Remove",
			"机器检查通过": "Automated check passed",
			"检查未通过": "Check failed",
			"需专业审阅": "Professional review required",
			"待检查": "Pending check",
			"添加验收项": "Add acceptance item",
			"尚未形成验收项。": "No acceptance items yet.",
			"专业审阅记录": "Professional review notes",
			"保存并继续任务": "Save and continue task",
			"仅保存要求": "Save requirements only",
			"取消修改": "Discard edits"
		};
		function localizeDepthCopy(value, locale) {
			if (String(locale || "").startsWith("zh")) return value;
			return en[value] ?? value;
		}
		//#endregion
		//#region src/client/professional-depth.js
		const fields = [
			[
				"purpose",
				"实际用途与受众",
				"成果用于什么工作、给谁使用或支持什么决策"
			],
			[
				"depth",
				"专业深度",
				"需要说明、分析、计算，还是可执行的交付成果"
			],
			[
				"evidence",
				"事实依据与缺口",
				"已知事实、所选资料、需要补充的关键条件"
			],
			[
				"format",
				"成果格式",
				"文件类型、模板、结构、图表与版式要求"
			],
			[
				"acceptance",
				"验收口径",
				"怎样判断任务已满足实际使用需求"
			]
		];
		const kinds = [
			["review", "专业审阅"],
			["file", "文件与格式"],
			["contains", "包含指定内容"],
			["json", "有效 JSON"]
		];
		const pendingModes = /* @__PURE__ */ new WeakMap();
		function prepareDepthSubmission(composer, draft, hasAttachments, locale = "zh") {
			const pending = composer.inputActions && pendingModes.get(composer.inputActions);
			if (!pending || composer.sessionId || !draft.trim() && !hasAttachments) return draft;
			pendingModes.delete(composer.inputActions);
			return String(locale).startsWith("zh") ? `启用专业深度。\n${draft}${pending.template ? `\n\n我主动选用以下模板作为参考，当前需求优先，模板中的旧事实不代表本次事实：\n<reference-template>\n${pending.template.content}\n</reference-template>` : ""}` : `Enable professional depth.\n${draft}${pending.template ? `\n\nI selected the following template as reference. The current task takes priority; old project facts in the template do not apply here:\n<reference-template>\n${pending.template.content}\n</reference-template>` : ""}`;
		}
		function createProfessionalDepth({ React, api, run, subscribe, useLanguage }) {
			const h = React.createElement;
			return function ProfessionalDepth({ composer }) {
				const locale = useLanguage();
				const t = (value) => localizeDepthCopy(value, locale);
				const id = composer.sessionId || "";
				const [state, setState] = React.useState(null);
				const [edit, setEdit] = React.useState(null);
				const [open, setOpen] = React.useState(false);
				const [busy, setBusy] = React.useState(false);
				const [error, setError] = React.useState("");
				const [draftEnabled, setDraftEnabled] = React.useState(false);
				const [templates, setTemplates] = React.useState([]);
				const [template, setTemplate] = React.useState(null);
				const [templateEdit, setTemplateEdit] = React.useState(null);
				const [savedPath, setSavedPath] = React.useState("");
				const templateRequest = (suffix = "", body) => api(`/api/agent-pi/professional-depth/templates${suffix}`, composer.cwd, body ? {
					method: "POST",
					body: JSON.stringify(body)
				} : void 0);
				React.useEffect(() => () => {
					if (composer.inputActions) pendingModes.delete(composer.inputActions);
				}, [composer.inputActions]);
				const url = `/api/agent-pi/professional-depth?sessionId=${encodeURIComponent(id)}`;
				const request = (body) => api(url, composer.cwd, body ? {
					method: "POST",
					body: JSON.stringify(body)
				} : void 0);
				React.useEffect(() => {
					if (!id) return;
					let disposed = false;
					let timer;
					const refresh = () => request().then((value) => {
						if (!disposed) setState(value);
					}).catch(() => {});
					refresh();
					const unsubscribe = subscribe(id, () => {
						clearTimeout(timer);
						timer = setTimeout(refresh, 250);
					});
					return () => {
						disposed = true;
						clearTimeout(timer);
						unsubscribe?.();
					};
				}, [id, composer.cwd]);
				React.useEffect(() => {
					if (!open || !id) return;
					let disposed = false;
					const timer = setInterval(() => request().then((value) => {
						if (!disposed) setState(value);
					}).catch(() => {}), 2500);
					return () => {
						disposed = true;
						clearInterval(timer);
					};
				}, [
					open,
					id,
					composer.cwd
				]);
				const perform = async (action) => {
					setBusy(true);
					setError("");
					try {
						await action();
					} catch (err) {
						setError(String(err.message || err));
					} finally {
						setBusy(false);
					}
				};
				const show = () => {
					setOpen(true);
					setEdit(null);
					setError("");
					templateRequest().then(setTemplates).catch((err) => setError(String(err.message || err)));
					if (id) perform(async () => {
						setState(await request());
					});
				};
				const enabled = id ? !!state?.enabled : draftEnabled;
				const toggle = () => perform(async () => {
					if (!id) {
						if (composer.inputActions) if (draftEnabled) pendingModes.delete(composer.inputActions);
						else pendingModes.set(composer.inputActions, { template });
						setDraftEnabled(!draftEnabled);
						return;
					}
					const latest = await request();
					setState(await request({
						action: "toggle",
						enabled: !latest.enabled,
						revision: latest.revision
					}));
					setEdit(null);
				});
				const save = (continueTask) => perform(async () => {
					setState(await request({
						action: "brief",
						revision: edit.revision,
						brief: edit.brief,
						criteria: edit.criteria
					}));
					setEdit(null);
					if (continueTask) {
						setOpen(false);
						run(composer, "我已修改专业深度任务说明，请按最新版本定向调整受影响的成果，并重新检查相关验收项。");
					}
				});
				const updateField = (field, value) => setEdit((current) => ({
					...current,
					brief: {
						...current.brief,
						[field]: value
					}
				}));
				const selectTemplate = (templateId) => perform(async () => {
					const selected = templateId ? await templateRequest(`?id=${encodeURIComponent(templateId)}`) : null;
					if (id) setState(await request({
						action: "template",
						revision: (await request()).revision,
						template: selected
					}));
					else if (composer.inputActions) pendingModes.set(composer.inputActions, { template: selected });
					setTemplate(selected);
				});
				const startTemplate = () => {
					setSavedPath("");
					setTemplateEdit({
						title: "",
						content: locale.startsWith("zh") ? `## 触发场景\n描述适用的工作类型，去掉本项目名称和具体事实。\n\n## 需求澄清清单\n只列无法从任务推断、且会改变结果的关键问题。\n\n## 标准做法\n${state?.brief?.depth || "填写可复用的工作步骤。"}\n\n## 禁区\n填写应保留的边界，不携带凭据或项目敏感资料。\n\n## 提示词模板\n围绕实际用途完成任务；事实、资料和参数以本次输入为准。\n\n## 验收标准\n${state?.brief?.acceptance || "填写可检查的交付要求。"}` : `## When to use\nDescribe the type of work without project names or facts.\n\n## Questions to clarify\nList only unknowns that could change the result.\n\n## Standard approach\n${state?.brief?.depth || "Describe reusable work steps."}\n\n## Boundaries\nState what must be preserved; omit credentials and sensitive project data.\n\n## Prompt template\nComplete the task for its intended use. Use the current inputs for facts, sources and parameters.\n\n## Acceptance criteria\n${state?.brief?.acceptance || "List verifiable delivery requirements."}`
					});
				};
				const saveTemplate = () => perform(async () => {
					setSavedPath((await templateRequest("", templateEdit)).path);
					setTemplateEdit(null);
					setTemplates(await templateRequest());
				});
				const updateCriterion = (index, patch) => setEdit((current) => ({
					...current,
					criteria: current.criteria.map((row, i) => i === index ? {
						...row,
						...patch
					} : row)
				}));
				const shown = edit || state;
				return h(React.Fragment, null, h("button", {
					type: "button",
					className: `ap-codex-turn${enabled ? " on" : ""}`,
					onClick: show,
					"aria-label": t("专业深度"),
					"aria-pressed": !!enabled,
					title: enabled ? t("查看任务说明和交付检查") : t("按实际用途研判任务、格式和验收要求")
				}, t("专业深度"), enabled ? t(" · 已启用") : ""), open && h("div", {
					className: "ap-overlay ap-depth-overlay",
					onClick: (event) => {
						if (event.target === event.currentTarget && !edit) setOpen(false);
					}
				}, h("section", {
					className: "ap-modal ap-depth-modal",
					role: "dialog",
					"aria-modal": true,
					"aria-label": t("专业深度任务说明")
				}, h("button", {
					type: "button",
					className: "ap-close",
					"aria-label": t("关闭专业深度面板"),
					onClick: () => setOpen(false)
				}, "×"), h("h2", null, t("专业深度")), h("p", { className: "ap-sub" }, t("围绕实际用途、专业依据和交付要求，继续在当前 DSH 对话中完成任务。只使用你在本对话选定的知识库资料。")), h("div", { className: "ap-row ap-depth-actions" }, h("span", {
					className: "ap-depth-status",
					role: "status"
				}, enabled ? !id || state?.needsAssessment ? t("已启用 · 等待你的任务输入") : t("任务说明 · 第 ") + state.revision + t(" 版") : t("默认关闭")), h("button", {
					type: "button",
					disabled: busy || !!edit,
					onClick: toggle
				}, enabled ? t("关闭专业深度") : t("启用专业深度")), state?.enabled && !edit && h("button", {
					type: "button",
					disabled: busy,
					onClick: () => setEdit(structuredClone(state))
				}, t("编辑任务说明"))), h("p", { className: "ap-sub" }, t("开启只保存选择，不发送消息。输入并发送实际任务后，明确需求直接执行，关键目标不清楚时再集中询问；新对话默认关闭。")), h("div", { className: "ap-depth-templates" }, h("h3", null, t("可复用模板")), h("p", { className: "ap-sub" }, t("由你主动保存、选用。不会自动保存经验、扫描项目或向新对话加载模板。保存前请去掉本次项目事实。")), h("select", {
					"aria-label": t("选用专业深度模板"),
					disabled: busy || !enabled,
					value: (id ? state?.template?.id : template?.id) || "",
					onChange: (e) => selectTemplate(e.target.value)
				}, h("option", { value: "" }, t("不使用模板")), templates.map((item) => h("option", {
					key: item.id,
					value: item.id
				}, item.title))), h("button", {
					type: "button",
					disabled: busy,
					onClick: startTemplate
				}, t("整理并保存为模板")), (id ? state?.template : template) && h("details", null, h("summary", null, t("查看已选模板")), h("pre", { className: "ap-depth-notes" }, (id ? state.template : template).content)), templateEdit && h("div", { className: "ap-depth-template-edit" }, h("input", {
					"aria-label": t("模板名称"),
					placeholder: t("例如：施工方案审阅"),
					value: templateEdit.title,
					maxLength: 120,
					onChange: (e) => setTemplateEdit((value) => ({
						...value,
						title: e.target.value
					}))
				}), h("textarea", {
					"aria-label": t("模板内容"),
					rows: 12,
					maxLength: 24e3,
					value: templateEdit.content,
					onChange: (e) => setTemplateEdit((value) => ({
						...value,
						content: e.target.value
					}))
				}), h("button", {
					type: "button",
					disabled: busy || !templateEdit.title.trim(),
					onClick: saveTemplate
				}, t("保存模板")), h("button", {
					type: "button",
					onClick: () => setTemplateEdit(null)
				}, t("取消"))), savedPath && h("p", {
					role: "status",
					className: "ap-depth-notes"
				}, t("已保存 Markdown 模板：") + savedPath + t("。本次未自动选用。"))), error && h("p", {
					role: "alert",
					className: "ap-depth-error"
				}, error, " ", h("button", {
					type: "button",
					onClick: () => perform(async () => {
						setState(await request());
						setEdit(null);
					})
				}, t("载入最新版本"))), shown && h("div", { className: "ap-depth-fields" }, fields.map(([field, label, placeholder]) => h("label", { key: field }, h("strong", null, t(label)), edit ? h("textarea", {
					value: edit.brief[field],
					maxLength: 6e3,
					rows: 3,
					placeholder: t(placeholder),
					onChange: (event) => updateField(field, event.target.value)
				}) : h("p", null, shown.brief[field] || t("发送任务后，由当前智能体结合实际需求整理。"))))), shown && h("div", { className: "ap-depth-criteria" }, h("h3", null, t("验收项与交付检查")), h("p", { className: "ap-sub" }, t("文件检查仅证明所列条件。专业准确性、计算和视觉版式需结合实际证据审阅；检查结果记录当时的文件内容。")), shown.criteria.map((criterion, index) => {
					const result = state.checks.find((item) => item.id === criterion.id);
					return h("div", {
						key: criterion.id,
						className: "ap-depth-criterion"
					}, edit ? h(React.Fragment, null, h("input", {
						"aria-label": t("验收项 ") + (index + 1),
						value: criterion.title,
						placeholder: t("具体的验收条件"),
						onChange: (e) => updateCriterion(index, { title: e.target.value })
					}), h("select", {
						"aria-label": t("检查方式 ") + (index + 1),
						value: criterion.kind,
						onChange: (e) => updateCriterion(index, { kind: e.target.value })
					}, kinds.map(([value, label]) => h("option", {
						key: value,
						value
					}, t(label)))), criterion.kind !== "review" && h("input", {
						"aria-label": t("文件路径 ") + (index + 1),
						value: criterion.path || "",
						placeholder: t("相对于当前工作区的文件路径"),
						onChange: (e) => updateCriterion(index, { path: e.target.value })
					}), criterion.kind === "contains" && h("input", {
						"aria-label": t("预期内容 ") + (index + 1),
						value: criterion.expected || "",
						placeholder: t("必须包含的实际文本"),
						onChange: (e) => updateCriterion(index, { expected: e.target.value })
					}), h("button", {
						type: "button",
						onClick: () => setEdit((current) => ({
							...current,
							criteria: current.criteria.filter((_, i) => i !== index)
						}))
					}, t("移除"))) : h(React.Fragment, null, h("strong", null, criterion.title), h("span", { className: `ap-depth-check ${result?.status || "pending"}` }, result ? {
						passed: t("机器检查通过"),
						failed: t("检查未通过"),
						review: t("需专业审阅")
					}[result.status] : t("待检查")), criterion.path && h("p", { className: "ap-sub" }, criterion.path), result && h("p", { className: "ap-sub" }, result.detail)));
				}), edit && h("button", {
					type: "button",
					disabled: edit.criteria.length >= 20,
					onClick: () => setEdit((current) => ({
						...current,
						criteria: [...current.criteria, {
							id: crypto.randomUUID(),
							title: "",
							kind: "review"
						}]
					}))
				}, t("添加验收项")), !shown.criteria.length && h("p", { className: "ap-sub" }, t("尚未形成验收项。")), !edit && state.reviewNotes && h("div", null, h("h4", null, t("专业审阅记录")), h("p", { className: "ap-depth-notes" }, state.reviewNotes))), edit && h("div", { className: "ap-row ap-depth-actions" }, h("button", {
					type: "button",
					disabled: busy,
					onClick: () => save(true)
				}, t("保存并继续任务")), h("button", {
					type: "button",
					disabled: busy,
					onClick: () => save(false)
				}, t("仅保存要求")), h("button", {
					type: "button",
					disabled: busy,
					onClick: () => setEdit(null)
				}, t("取消修改"))))));
			};
		}
		const professionalDepthCss = `
.ap-depth-overlay{z-index:10080}.ap-depth-modal{max-width:780px;width:calc(100vw - 36px);max-height:85vh;overflow:auto;padding:28px}
.ap-depth-fields{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:20px 0}.ap-depth-fields label:last-child{grid-column:1/-1}
.ap-depth-fields strong{display:block;margin-bottom:6px}.ap-depth-fields p,.ap-depth-notes{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}
.ap-depth-modal button:not(.ap-close){border:1px solid var(--border,#d7dce2);border-radius:8px;padding:7px 12px;background:var(--background,#fff);color:inherit;font:inherit;cursor:pointer}.ap-depth-modal button:disabled{opacity:.5;cursor:default}
.ap-depth-fields textarea,.ap-depth-criterion input,.ap-depth-criterion select{width:100%;box-sizing:border-box;padding:9px;border:1px solid var(--border,#ddd);border-radius:8px;background:var(--background,#fff);color:inherit;font:inherit}
.ap-depth-template-edit input,.ap-depth-template-edit textarea{width:100%;box-sizing:border-box;margin:8px 0;padding:9px;background:var(--background,#fff);color:inherit;border:1px solid var(--border,#ddd);border-radius:8px;font:inherit}.ap-depth-templates select{max-width:100%;padding:7px;margin-right:10px;background:var(--background,#fff);color:inherit;border:1px solid var(--border,#ddd);border-radius:8px}.ap-depth-templates pre{font:inherit}
.ap-depth-actions{flex-wrap:wrap;gap:10px;margin:14px 0}.ap-depth-criterion{padding:12px 0;border-top:1px solid var(--border,#ddd);display:flex;flex-wrap:wrap;gap:8px}.ap-depth-criterion p{width:100%;margin:0}.ap-depth-check{font-size:12px;border-radius:5px;padding:3px 7px;background:#edf3f4}.ap-depth-check.failed,.ap-depth-error{color:#b42318}.ap-depth-check.passed{color:#166534}.ap-depth-check.review{color:#825600}.ap-depth-status{margin-right:auto}
@media(max-width:600px){.ap-depth-fields{grid-template-columns:1fr}.ap-depth-modal{padding:20px}}
`;
		//#endregion
		//#region src/client/task-process.js
		/** Task status only; native Chat settings own work-details presentation. */
		const taskProcessCss = `
.ap-task-process{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-secondary,#687280);max-width:520px}.ap-task-process span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;
		function taskProcessSummary(snapshot, fallbackLanguage = "zh") {
			const text = ([...snapshot?.chat?.legacy?.nodes || []].reverse().find((node) => (node.kind === "user" || node.kind === "steering") && node.source?.kind === "user")?.content || []).filter((part) => part.type === "text").map((part) => part.text).join(" ");
			const language = /[\u3400-\u9fff]/u.test(text) ? "zh" : /[a-zA-Z]/.test(text) ? "en" : fallbackLanguage;
			if (!snapshot?.running) return {
				language,
				text: ""
			};
			const name = snapshot?.chat?.legacy?.runningCalls?.at(-1)?.name || "";
			return {
				language,
				text: (language === "zh" ? {
					read: "正在阅读任务资料",
					search: "正在查找相关依据",
					write: "正在整理交付成果",
					review: "正在核对交付要求",
					work: "正在处理本次任务"
				} : {
					read: "Reading task materials",
					search: "Finding relevant evidence",
					write: "Preparing deliverables",
					review: "Checking delivery requirements",
					work: "Working on this task"
				})[/^(read|read_image|web_fetch)$/.test(name) ? "read" : /^(web_search|grep|glob|kb_search)$/.test(name) ? "search" : /^(write|edit|univer_)/.test(name) ? "write" : /^(professional_depth|present)$/.test(name) ? "review" : "work"]
			};
		}
		function createTaskProcess({ React, snapshot, subscribe, language }) {
			const h = React.createElement;
			return function TaskProcess({ sessionId }) {
				const [, refresh] = React.useState(0);
				React.useEffect(() => {
					let timer;
					const stop = subscribe(sessionId, () => {
						if (timer) return;
						timer = setTimeout(() => {
							timer = null;
							refresh((n) => n + 1);
						}, 200);
					});
					return () => {
						clearTimeout(timer);
						stop?.();
					};
				}, [sessionId]);
				const summary = taskProcessSummary(snapshot(sessionId), language());
				if (!summary.text) return null;
				return h("div", { className: "ap-task-process" }, h("span", {
					role: "status",
					"aria-live": "polite"
				}, summary.text));
			};
		}
		//#endregion
		//#region src/client/capability-labels.js
		const ENGLISH_CAPABILITIES = {
			"tender:full-analysis": ["Full tender document analysis", "Locate source text and cover all pages, tables, drawings, attachments, addenda, measurement rules, scoring and submission requirements"],
			"tender:item-derivation": ["BOQ item cost and resource derivation", "Reconcile scope and measurement, methods, productivity, resource consumption and prices item by item"],
			"tender:execution-plan": ["Tender execution planning", "Develop a detailed plan from actual work packages, resources and project conditions"],
			"tender:returnables": ["Tender returnables and forms", "Prepare submissions against the actual returnables list, scoring criteria and templates"],
			"delivery:drawing": ["Construction drawing review", "Identify drawing numbers, revisions, units, elements and construction constraints"],
			"delivery:quantity": ["Quantity takeoff", "Link drawing locations, elements, calculations, units, deductions and BOQ scope"],
			"delivery:method": ["Project method statement", "Describe site conditions, work steps, resource assumptions, inspections and exception handling"],
			"investment:research": ["Professional research and decision report", "Investigate and assess the current question, location, date and audience"]
		};
		function localizeCapability(row, locale) {
			if (String(locale || "").toLowerCase().startsWith("zh")) return row;
			const copy = ENGLISH_CAPABILITIES[row.id];
			return copy ? {
				...row,
				title: copy[0],
				description: copy[1]
			} : row;
		}
		//#endregion
		//#region src/client/task-guide.js
		const taskGuideCss = `
.ap-task-guide{position:relative;width:100%;height:100%;min-height:0;min-width:0;box-sizing:border-box;padding-bottom:var(--dsh-composer-height,180px);background:var(--bg-primary,#fff);color:var(--text-primary,#273240);display:flex;flex-direction:column;font-size:14px}
.ap-task-guide header,.ap-task-guide footer{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--border,#d5dae1)}
.ap-task-guide header h2{margin:0;font-size:18px}.ap-task-guide nav{display:flex;gap:6px;padding:12px 24px;flex-wrap:wrap}.ap-task-guide button{font:inherit;border:1px solid var(--border,#d5dae1);border-radius:6px;background:var(--bg-secondary,#f4f6f8);color:inherit;padding:7px 12px;cursor:pointer}.ap-task-guide button[aria-selected=true]{background:var(--accent,#285c7b);color:#fff}.ap-task-guide button:disabled{opacity:.5;cursor:default}
.ap-task-guide main{padding:8px 24px 24px;overflow:auto;flex:1}.ap-task-guide label{display:flex;flex-direction:column;gap:6px;margin:12px 0}.ap-task-guide input,.ap-task-guide textarea,.ap-task-guide select{font:inherit;border:1px solid var(--border,#d5dae1);border-radius:6px;padding:9px;background:var(--bg-secondary,#fafbfc);color:inherit;width:100%;box-sizing:border-box}.ap-task-guide textarea{min-height:75px;resize:vertical}.ap-task-guide p{line-height:1.6}.ap-task-guide article{border:1px solid var(--border,#d5dae1);border-radius:8px;padding:12px 16px;margin:12px 0}.ap-task-guide article h3{font-size:15px;margin:0 0 8px}.ap-task-guide article p{margin:6px 0;overflow-wrap:anywhere}.ap-task-guide .ap-guide-muted{color:var(--text-secondary,#687280);font-size:12px}.ap-task-guide .ap-guide-error{color:#b74434}.ap-task-guide footer{border-top:1px solid var(--border,#d5dae1);border-bottom:0}.ap-task-guide pre{white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:600px){.ap-task-guide header,.ap-task-guide footer{padding:12px 16px}.ap-task-guide main{padding:4px 16px 20px}.ap-task-guide nav{padding:10px 16px}.ap-task-guide footer{flex-wrap:wrap}}
`;
		const labels = {
			zh: {
				title: "本次任务",
				close: "关闭",
				goal: "目标与需求",
				basis: "项目依据",
				plan: "执行计划",
				capabilities: "可用能力",
				delivery: "交付检查",
				objective: "本次要完成什么",
				scope: "工作范围与边界",
				audience: "成果给谁使用",
				formats: "输出格式（逗号分隔）",
				language: "交付语言",
				deadline: "期限",
				profession: "专业方向",
				country: "项目国家/地区",
				location: "项目地点",
				employer: "业主/委托方",
				procurement: "采购体系",
				funding: "资金来源",
				contract: "合同及版本",
				measurement: "计量计价依据",
				standards: "已登记规范",
				webDiligence: "公共网络尽调",
				save: "保存需求",
				saving: "正在保存…",
				refresh: "读取最新状态",
				saved: "已保存，后续执行将采用本次需求。",
				waiting: "尚未登记执行计划。明确任务后，智能体会评估能力并按依赖推进。",
				noTask: "此对话尚未就绪，请先开始对话。",
				missing: "待补足",
				ready: "已通过登记的交付检查",
				review: "仍有待复核事项",
				accepted: "客户已验收",
				accept: "确认验收全部成果",
				signature: "确认此文件已签署/授权",
				signatures: "待签署/授权",
				source: "来源覆盖",
				evidence: "证据状态",
				unanswered: "待明确的问题",
				empty: "尚未登记",
				reminder: "来源抽取、专业复核和客户验收分别记录。修改条件后，受影响的计算与文件会待复核。"
			},
			en: {
				title: "Current task",
				close: "Close",
				goal: "Goal & brief",
				basis: "Project basis",
				plan: "Execution plan",
				capabilities: "Capabilities",
				delivery: "Delivery checks",
				objective: "What should this task accomplish?",
				scope: "Scope and boundaries",
				audience: "Audience",
				formats: "Output formats (comma separated)",
				language: "Delivery language",
				deadline: "Deadline",
				profession: "Professional field",
				country: "Project country/region",
				location: "Project location",
				employer: "Employer/client",
				procurement: "Procurement system",
				funding: "Funding source",
				contract: "Contract and version",
				measurement: "Measurement and pricing basis",
				standards: "Registered standards",
				webDiligence: "Public web diligence",
				save: "Save brief",
				saving: "Saving…",
				refresh: "Read latest state",
				saved: "Saved. Subsequent execution will use this brief.",
				waiting: "No execution plan yet. Once the brief is clear, the agent will assess capabilities and follow dependencies.",
				noTask: "This conversation is not ready. Start a conversation first.",
				missing: "Gaps to resolve",
				ready: "Registered delivery checks passed",
				review: "Review items remain",
				accepted: "Customer accepted",
				accept: "Accept all deliverables",
				signature: "Confirm this file is signed/authorized",
				signatures: "Signature/authorization pending",
				source: "Source coverage",
				evidence: "Evidence status",
				unanswered: "Open questions",
				empty: "Not registered",
				reminder: "Extraction, professional review and customer acceptance are recorded separately. Changed conditions require affected calculations and files to be reviewed."
			}
		};
		const professions = [
			"general",
			"tender",
			"drawing",
			"quantity",
			"method",
			"research",
			"report",
			"spreadsheet"
		];
		const professionZh = [
			"通用企业任务",
			"投标",
			"施工图读图",
			"工程量计算",
			"施工方案",
			"调研",
			"汇报",
			"表格"
		];
		function briefFromForm(brief, key, value) {
			return {
				...brief,
				[key]: key === "formats" ? value.split(/[,，]/).map((row) => row.trim()).filter(Boolean) : value
			};
		}
		function createTaskGuide({ React, api, cwd, language, subscribe }) {
			const h = React.createElement;
			return function TaskGuide({ sessionId, onClose }) {
				const open = true;
				const [tab, setTab] = React.useState("goal");
				const [result, setResult] = React.useState(null), [draft, setDraft] = React.useState(null);
				const [dirty, setDirty] = React.useState(false), [busy, setBusy] = React.useState(false), [message, setMessage] = React.useState(""), [error, setError] = React.useState("");
				const text = labels[language()?.startsWith("zh") ? "zh" : "en"];
				const displayState = (value) => (text === labels.zh ? {
					available: "可用",
					conditional: "需核实适用条件",
					unavailable: "当前不可用",
					not_applicable: "不适用于本次任务",
					pending: "待处理",
					running: "进行中",
					done: "已完成",
					stale: "条件已变更，待复核",
					verified: "已核验",
					unverified: "待核实",
					conflict: "有冲突",
					parsed: "已抽取",
					reviewed: "已复核",
					missing: "缺失",
					unreadable: "不可读",
					draft: "草稿",
					ready: "待客户验收",
					accepted: "已验收",
					signed: "已签署",
					not_required: "无需签署",
					passed: "通过",
					failed: "未通过",
					review: "需复核"
				} : {
					available: "Available",
					conditional: "Check applicability",
					unavailable: "Unavailable",
					not_applicable: "Not applicable to this task",
					pending: "Pending",
					running: "In progress",
					done: "Completed",
					stale: "Changed conditions; review required",
					verified: "Verified",
					unverified: "Unverified",
					conflict: "Conflict",
					parsed: "Extracted",
					reviewed: "Reviewed",
					missing: "Missing",
					unreadable: "Unreadable",
					draft: "Draft",
					ready: "Ready for customer review",
					accepted: "Accepted",
					signed: "Signed",
					not_required: "No signature required",
					passed: "Passed",
					failed: "Failed",
					review: "Review required"
				})[value] || String(value || "").replaceAll("_", " ");
				const endpoint = "/api/agent-pi/professional-task?sessionId=" + encodeURIComponent(sessionId || "");
				React.useEffect(() => {
					setResult(null);
					setDraft(null);
					setDirty(false);
					setError("");
				}, [sessionId]);
				React.useEffect(() => {
					if (!sessionId || dirty) return;
					const controller = new AbortController();
					let loading = false;
					const refresh = async () => {
						if (loading) return;
						loading = true;
						try {
							const next = await api(endpoint, cwd(), { signal: controller.signal });
							if (!controller.signal.aborted) {
								setResult(next);
								setDraft(structuredClone(next.task));
								setError("");
							}
						} catch (e) {
							if (!controller.signal.aborted) setError(e.message);
						} finally {
							loading = false;
						}
					};
					refresh();
					const timer = setInterval(refresh, 5e3), dispose = subscribe?.(sessionId, refresh);
					return () => {
						controller.abort();
						clearInterval(timer);
						dispose?.();
					};
				}, [
					open,
					sessionId,
					dirty,
					endpoint
				]);
				async function save(patch) {
					setBusy(true);
					setError("");
					setMessage("");
					try {
						const next = await api(endpoint, cwd(), {
							method: "POST",
							body: JSON.stringify({
								revision: draft.revision,
								patch
							})
						});
						setDraft(next.task);
						setResult(next);
						setDirty(false);
						setMessage(text.saved);
					} catch (e) {
						setError(e.message);
					} finally {
						setBusy(false);
					}
				}
				async function reload() {
					setBusy(true);
					setError("");
					setMessage("");
					try {
						const next = await api(endpoint, cwd());
						setResult(next);
						setDraft(structuredClone(next.task));
						setDirty(false);
					} catch (e) {
						setError(e.message);
					} finally {
						setBusy(false);
					}
				}
				const edit = (key, value, basis = false) => {
					setDraft({
						...draft,
						brief: basis ? {
							...draft.brief,
							basis: {
								...draft.brief.basis,
								[key]: value
							}
						} : briefFromForm(draft.brief, key, value)
					});
					setDirty(true);
					setMessage("");
				};
				const field = (key, basis = false, multiline = false) => h("label", { key }, text[key], h(multiline ? "textarea" : "input", {
					value: (basis ? draft.brief.basis[key] : key === "formats" ? draft.brief.formats.join(", ") : draft.brief[key]) || "",
					onChange: (e) => edit(key, e.target.value, basis)
				}));
				const article = (id, title, body) => h("article", { key: id }, h("h3", null, title), body);
				let body = null;
				if (draft) {
					if (tab === "goal") body = h(React.Fragment, null, field("objective", false, true), field("scope", false, true), field("audience"), h("label", null, text.profession, h("select", {
						value: draft.brief.profession,
						onChange: (e) => edit("profession", e.target.value)
					}, professions.map((value, index) => h("option", {
						key: value,
						value
					}, text === labels.zh ? professionZh[index] : value)))), field("formats"), field("language"), field("deadline"), h("label", null, text.webDiligence, h("select", {
						value: draft.brief.webDiligence,
						onChange: (e) => edit("webDiligence", e.target.value)
					}, [
						["allowed", text === labels.zh ? "允许任务相关公开尽调" : "Allow task-related public diligence"],
						["ask", text === labels.zh ? "需要时询问" : "Ask when needed"],
						["forbidden", text === labels.zh ? "仅使用已提供资料" : "Use supplied materials only"]
					].map(([value, label]) => h("option", {
						key: value,
						value
					}, label)))), h("h3", null, text.unanswered), draft.questions.map((row) => h("label", { key: row.id }, row.question, h("textarea", {
						value: row.answer || "",
						onChange: (e) => {
							setDraft({
								...draft,
								questions: draft.questions.map((q) => q.id === row.id ? {
									...q,
									answer: e.target.value
								} : q)
							});
							setDirty(true);
						}
					}))));
					if (tab === "basis") body = h(React.Fragment, null, [
						"country",
						"location",
						"employer",
						"procurement",
						"funding",
						"contract",
						"measurement"
					].map((key) => field(key, true)), h("h3", null, text.standards), draft.brief.basis.standards.map((row) => article(row.id, row.title, h("p", null, row.version + " · " + row.scope + " · " + row.evidenceId))), h("h3", null, text.evidence), draft.evidence.map((row) => article(row.id, row.title, h(React.Fragment, null, h("p", null, row.value), h("p", { className: "ap-guide-muted" }, row.kind + " · " + displayState(row.status) + " · " + (row.locator || row.url || row.basis || ""))))));
					if (tab === "plan") body = h(React.Fragment, null, h("p", null, draft.assessment || text.waiting), draft.plan.map((row) => article(row.id, row.title, h(React.Fragment, null, h("p", null, displayState(row.status)), h("p", { className: "ap-guide-muted" }, row.dependsOn.join(" → ")), row.gaps.map((gap, index) => h("p", { key: "g" + index }, text.missing + ": " + gap)), row.supplements.map((supplement, index) => h("p", { key: "s" + index }, supplement))))), h("h3", null, text.source), draft.coverage.map((row) => article(row.id, row.title, h("p", null, displayState(row.status) + " · " + (row.review || "") + " · " + row.locator))));
					if (tab === "capabilities") body = result?.capabilities?.toSorted((a, b) => [
						"available",
						"conditional",
						"unavailable",
						"not_applicable"
					].indexOf(a.status) - [
						"available",
						"conditional",
						"unavailable",
						"not_applicable"
					].indexOf(b.status)).map((capability) => {
						const row = localizeCapability(capability, language());
						return article(row.id, row.title, h(React.Fragment, null, h("p", null, displayState(row.status)), h("p", null, row.description), h("p", { className: "ap-guide-muted" }, row.owner + " · " + row.version), [
							...row.reasons || [],
							...row.limitations || [],
							...row.supplements || []
						].map((value, index) => h("p", { key: index }, value))));
					});
					if (tab === "delivery") body = h(React.Fragment, null, h("p", null, result?.audit?.customerAccepted ? text.accepted : result?.audit?.readyForCustomerReview ? text.ready : text.review), result?.audit?.issues?.map((row, index) => h("p", {
						key: index,
						className: "ap-guide-error"
					}, row.detail)), draft.deliverables.map((row) => article(row.id, row.title, h(React.Fragment, null, h("p", null, row.path), h("p", null, displayState(row.status) + " · " + displayState(row.signature)), row.checks.map((check, index) => h("p", { key: index }, check.kind + " · " + displayState(check.status) + " — " + check.detail)), row.signature === "pending" ? h("button", {
						disabled: busy || dirty,
						onClick: () => save({ deliverables: draft.deliverables.map((item) => item.id === row.id ? {
							...item,
							signature: "signed"
						} : item) })
					}, text.signature) : null))), result?.audit?.readyForCustomerReview ? h("button", {
						disabled: busy || dirty,
						onClick: () => save({ deliverables: draft.deliverables.map((row) => ({
							...row,
							status: "accepted"
						})) })
					}, text.accept) : null);
				}
				return h("section", {
					className: "ap-task-guide",
					"data-conversation-composer-overlay": "",
					role: "region",
					"aria-label": text.title
				}, h("header", null, h("h2", null, text.title), onClose ? h("button", { onClick: onClose }, text.close) : null), h("nav", { "aria-label": text.title }, [
					"goal",
					"basis",
					"plan",
					"capabilities",
					"delivery"
				].map((key) => h("button", {
					key,
					role: "tab",
					"aria-selected": tab === key,
					onClick: () => setTab(key)
				}, text[key]))), h("main", null, h("p", { className: "ap-guide-muted" }, text.reminder), error ? h("p", {
					role: "alert",
					className: "ap-guide-error"
				}, error) : null, message ? h("p", { role: "status" }, message) : null, !sessionId ? h("p", null, text.noTask) : body), h("footer", null, h("button", {
					disabled: busy,
					onClick: reload
				}, text.refresh), h("button", {
					disabled: busy || !dirty || !draft,
					onClick: () => save({
						brief: draft.brief,
						questions: draft.questions
					})
				}, busy ? text.saving : text.save)));
			};
		}
		//#endregion
		//#region src/client/locales/codex-execution.js
		const keys = [
			"main",
			"ready",
			"starting",
			"running",
			"waiting",
			"failed",
			"stop",
			"intro",
			"you",
			"tool",
			"answerNeeded",
			"approvalNeeded",
			"choose",
			"other",
			"reply",
			"approve",
			"decline",
			"switchBlocked",
			"desktopRequired",
			"loginRequired",
			"runtimeUnavailable",
			"modelUnavailable",
			"accessDenied",
			"quotaExceeded",
			"requestFailed",
			"processDisconnected",
			"requestTimeout",
			"openConversation",
			"engineCodexTitle",
			"engineDshTitle",
			"attachmentsNotReady",
			"attachmentPathUnavailable",
			"sessionBusy",
			"invalidTask",
			"switchWorkspace",
			"answerAll",
			"approvalInvalid",
			"interactionExpired",
			"attachmentTask"
		];
		const codexExecutionLocales = Object.fromEntries(Object.entries({
			zh: [
				"Codex 主执行",
				"待命",
				"正在启动",
				"执行中",
				"等待答复或批准",
				"执行失败",
				"停止",
				"在下方输入任务，Codex 将直接与你交流，并使用同一套专业工具和任务依据。",
				"你",
				"工具执行",
				"需要你的答复",
				"需要你的批准",
				"请选择",
				"其他",
				"回复并继续",
				"批准本次操作",
				"拒绝",
				"请先停止当前 Codex 任务再切换引擎。",
				"Codex 主执行需要新版桌面应用。",
				"请先在 Codex 设置中登录账户。",
				"Codex 运行环境不可用，请检查桌面应用安装。",
				"所选 Codex 模型不可用，请选择其他模型。",
				"当前账户无权使用所选 Codex 模型。",
				"账户额度已耗尽，请检查额度后重试。",
				"请求失败，请重试。",
				"Codex 连接已断开，请重试。",
				"请求超时，请重试。",
				"打开对话",
				"当前由 Codex 主执行，点击切换至 DSH",
				"选择 Codex 主执行",
				"附件尚未准备好，请等待上传完成。",
				"无法获取附件的本机路径，请重新选择文件。",
				"当前会话正在执行任务，请先停止或等待完成。",
				"任务内容无效，请输入任务后重试。",
				"请先切换至此任务的工作目录。",
				"请回答所有问题后继续。",
				"批准选项无效，请重新选择。",
				"此交互请求已失效，请读取最新任务状态。",
				"请检查所附原稿，明确当前任务需要完成的工作。"
			],
			en: [
				"Codex main execution",
				"Ready",
				"Starting",
				"Running",
				"Waiting for your response or approval",
				"Failed",
				"Stop",
				"Enter a task below. Codex communicates directly with you and uses the shared professional tools and task basis.",
				"You",
				"Tool execution",
				"Your answer is needed",
				"Approval needed",
				"Choose",
				"Other",
				"Reply and continue",
				"Approve this action",
				"Decline",
				"Stop the current Codex task before switching engines.",
				"Codex main execution requires the updated desktop app.",
				"Sign in to your account in Codex settings first.",
				"The Codex runtime is unavailable. Check the desktop app installation.",
				"The selected Codex model is unavailable. Choose another model.",
				"Your account cannot use the selected Codex model.",
				"Your account quota is exhausted. Check your quota before retrying.",
				"Request failed. Please retry.",
				"Codex disconnected. Please retry.",
				"Request timed out. Please retry.",
				"Open conversation",
				"Codex is the main executor. Click to switch to DSH.",
				"Use Codex as the main executor",
				"Attachments are not ready. Wait for the upload to finish.",
				"The local attachment path is unavailable. Select the file again.",
				"This session is running a task. Stop it or wait for completion.",
				"Invalid task. Enter a task and retry.",
				"Switch to this task’s working directory first.",
				"Answer all questions to continue.",
				"Invalid approval choice. Choose again.",
				"This interaction has expired. Load the latest task state.",
				"Inspect the attached originals and clarify the work required for this task."
			],
			ja: [
				"Codex による実行",
				"準備完了",
				"起動中",
				"実行中",
				"回答または承認を待っています",
				"実行に失敗",
				"中止する",
				"下にタスクを入力してください。Codex が直接対話し、共通の専門ツールとタスクの根拠を使って実行します。",
				"あなた",
				"ツールの実行",
				"回答が必要です",
				"承認が必要です",
				"選んでください",
				"その他",
				"回答して続行",
				"この操作を承認",
				"拒否する",
				"実行エンジンを切り替える前に、現在の Codex タスクを中止してください。",
				"Codex による実行には最新版のデスクトップアプリが必要です。",
				"まず Codex 設定でアカウントにログインしてください。",
				"Codex の実行環境を利用できません。デスクトップアプリのインストールを確認してください。",
				"選択した Codex モデルは利用できません。別のモデルを選んでください。",
				"このアカウントでは選択した Codex モデルを利用できません。",
				"アカウントの利用枠を使い切りました。利用枠を確認して再試行してください。",
				"リクエストに失敗しました。再試行してください。",
				"Codex の接続が切れました。再試行してください。",
				"リクエストがタイムアウトしました。再試行してください。",
				"会話を開く",
				"Codex が実行エンジンに選ばれています。クリックすると DSH に切り替わります。",
				"Codex を実行エンジンに選ぶ",
				"添付ファイルの準備ができていません。アップロードの完了を待ってください。",
				"添付ファイルのローカルパスを取得できません。ファイルを選び直してください。",
				"このセッションではタスクを実行中です。中止するか完了を待ってください。",
				"タスクが無効です。タスクを入力して再試行してください。",
				"まず、このタスクの作業ディレクトリに切り替えてください。",
				"すべての質問に回答して続行してください。",
				"承認の選択が無効です。選び直してください。",
				"この操作要求は失効しました。最新のタスク状態を読み込んでください。",
				"添付された原本を確認し、このタスクで必要な作業を明確にしてください。"
			],
			ko: [
				"Codex 직접 실행",
				"준비됨",
				"시작 중",
				"실행 중",
				"답변 또는 승인 대기 중",
				"실행 실패",
				"중지",
				"아래에 작업을 입력하세요. Codex가 직접 대화하며 공통 전문 도구와 작업 근거를 사용합니다.",
				"사용자",
				"도구 실행",
				"답변이 필요합니다",
				"승인이 필요합니다",
				"선택",
				"기타",
				"답변하고 계속",
				"이 작업 승인",
				"거부",
				"실행 엔진을 전환하기 전에 현재 Codex 작업을 중지하세요.",
				"Codex 직접 실행에는 최신 데스크톱 앱이 필요합니다.",
				"먼저 Codex 설정에서 계정에 로그인하세요.",
				"Codex 실행 환경을 사용할 수 없습니다. 데스크톱 앱 설치를 확인하세요.",
				"선택한 Codex 모델을 사용할 수 없습니다. 다른 모델을 선택하세요.",
				"이 계정은 선택한 Codex 모델을 사용할 권한이 없습니다.",
				"계정 할당량을 모두 사용했습니다. 할당량을 확인한 후 다시 시도하세요.",
				"요청에 실패했습니다. 다시 시도하세요.",
				"Codex 연결이 끊겼습니다. 다시 시도하세요.",
				"요청 시간이 초과되었습니다. 다시 시도하세요.",
				"대화 열기",
				"Codex가 주 실행 엔진입니다. 클릭하여 DSH로 전환하세요.",
				"Codex를 주 실행 엔진으로 선택",
				"첨부 파일이 준비되지 않았습니다. 업로드가 완료될 때까지 기다리세요.",
				"첨부 파일의 로컬 경로를 사용할 수 없습니다. 파일을 다시 선택하세요.",
				"이 세션에서 작업을 실행 중입니다. 중지하거나 완료될 때까지 기다리세요.",
				"유효하지 않은 작업입니다. 작업을 입력하고 다시 시도하세요.",
				"먼저 이 작업의 작업 디렉터리로 전환하세요.",
				"계속하려면 모든 질문에 답변하세요.",
				"유효하지 않은 승인 선택입니다. 다시 선택하세요.",
				"이 상호작용 요청은 만료되었습니다. 최신 작업 상태를 불러오세요.",
				"첨부된 원본을 검토하고 이번 작업에서 해야 할 일을 명확히 하세요."
			],
			fr: [
				"Exécution principale par Codex",
				"Prêt",
				"Démarrage",
				"En cours",
				"En attente de votre réponse ou approbation",
				"Échec",
				"Arrêter",
				"Saisissez une tâche ci-dessous. Codex dialogue directement avec vous et utilise les outils professionnels et les bases de travail partagés.",
				"Vous",
				"Exécution d’un outil",
				"Votre réponse est nécessaire",
				"Approbation nécessaire",
				"Choisir",
				"Autre",
				"Répondre et continuer",
				"Approuver cette action",
				"Refuser",
				"Arrêtez la tâche Codex en cours avant de changer de moteur.",
				"L’exécution principale par Codex nécessite la dernière version de l’application de bureau.",
				"Connectez-vous d’abord à votre compte dans les paramètres Codex.",
				"L’environnement Codex est indisponible. Vérifiez l’installation de l’application de bureau.",
				"Le modèle Codex sélectionné est indisponible. Choisissez un autre modèle.",
				"Votre compte ne peut pas utiliser le modèle Codex sélectionné.",
				"Le quota de votre compte est épuisé. Vérifiez-le avant de réessayer.",
				"Échec de la requête. Réessayez.",
				"Codex est déconnecté. Réessayez.",
				"La requête a expiré. Réessayez.",
				"Ouvrir la conversation",
				"Codex est le moteur principal. Cliquez pour passer à DSH.",
				"Utiliser Codex comme moteur principal",
				"Les pièces jointes ne sont pas prêtes. Attendez la fin du téléversement.",
				"Le chemin local de la pièce jointe est indisponible. Sélectionnez à nouveau le fichier.",
				"Cette session exécute une tâche. Arrêtez-la ou attendez sa fin.",
				"Tâche incorrecte. Saisissez une tâche et réessayez.",
				"Passez d’abord au dossier de travail de cette tâche.",
				"Répondez à toutes les questions pour continuer.",
				"Choix d’approbation incorrect. Choisissez à nouveau.",
				"Cette demande d’interaction a expiré. Chargez le dernier état de la tâche.",
				"Examinez les originaux joints et précisez le travail à accomplir pour cette tâche."
			],
			de: [
				"Codex als Hauptausführung",
				"Bereit",
				"Wird gestartet",
				"Wird ausgeführt",
				"Wartet auf Ihre Antwort oder Freigabe",
				"Fehlgeschlagen",
				"Stoppen",
				"Geben Sie unten eine Aufgabe ein. Codex spricht direkt mit Ihnen und verwendet die gemeinsamen Fachwerkzeuge und Aufgabengrundlagen.",
				"Sie",
				"Werkzeugausführung",
				"Ihre Antwort ist erforderlich",
				"Freigabe erforderlich",
				"Auswählen",
				"Andere",
				"Antworten und fortfahren",
				"Diese Aktion freigeben",
				"Ablehnen",
				"Stoppen Sie die laufende Codex-Aufgabe, bevor Sie die Ausführungsengine wechseln.",
				"Die Codex-Hauptausführung erfordert die aktuelle Desktop-App.",
				"Melden Sie sich zuerst in den Codex-Einstellungen bei Ihrem Konto an.",
				"Die Codex-Laufzeit ist nicht verfügbar. Prüfen Sie die Installation der Desktop-App.",
				"Das gewählte Codex-Modell ist nicht verfügbar. Wählen Sie ein anderes Modell.",
				"Ihr Konto darf das gewählte Codex-Modell nicht verwenden.",
				"Ihr Kontingent ist aufgebraucht. Prüfen Sie es, bevor Sie es erneut versuchen.",
				"Anfrage fehlgeschlagen. Bitte erneut versuchen.",
				"Die Codex-Verbindung wurde getrennt. Bitte erneut versuchen.",
				"Zeitüberschreitung bei der Anfrage. Bitte erneut versuchen.",
				"Unterhaltung öffnen",
				"Codex ist die Hauptengine. Zum Wechsel zu DSH klicken.",
				"Codex als Hauptengine verwenden",
				"Die Anhänge sind noch nicht bereit. Warten Sie auf das Ende des Uploads.",
				"Der lokale Anhangspfad ist nicht verfügbar. Wählen Sie die Datei erneut aus.",
				"In dieser Sitzung läuft eine Aufgabe. Stoppen Sie sie oder warten Sie auf den Abschluss.",
				"Ungültige Aufgabe. Geben Sie eine Aufgabe ein und versuchen Sie es erneut.",
				"Wechseln Sie zuerst zum Arbeitsverzeichnis dieser Aufgabe.",
				"Beantworten Sie alle Fragen, um fortzufahren.",
				"Ungültige Freigabeauswahl. Wählen Sie erneut.",
				"Diese Interaktionsanfrage ist abgelaufen. Laden Sie den aktuellen Aufgabenstatus.",
				"Prüfen Sie die beigefügten Originale und klären Sie die erforderlichen Arbeiten für diese Aufgabe."
			],
			es: [
				"Ejecución principal con Codex",
				"Listo",
				"Iniciando",
				"En ejecución",
				"Esperando tu respuesta o aprobación",
				"Error de ejecución",
				"Detener",
				"Introduce una tarea abajo. Codex conversa directamente contigo y utiliza las herramientas profesionales y las bases de trabajo compartidas.",
				"Tú",
				"Ejecución de herramienta",
				"Se necesita tu respuesta",
				"Se necesita aprobación",
				"Elegir",
				"Otro",
				"Responder y continuar",
				"Aprobar esta acción",
				"Rechazar",
				"Detén la tarea Codex actual antes de cambiar de motor.",
				"La ejecución principal con Codex requiere la aplicación de escritorio actualizada.",
				"Primero inicia sesión en tu cuenta desde los ajustes de Codex.",
				"El entorno Codex no está disponible. Comprueba la instalación de la aplicación de escritorio.",
				"El modelo Codex seleccionado no está disponible. Elige otro modelo.",
				"Tu cuenta no puede usar el modelo Codex seleccionado.",
				"La cuota de tu cuenta está agotada. Compruébala antes de volver a intentarlo.",
				"La solicitud falló. Inténtalo de nuevo.",
				"Codex se desconectó. Inténtalo de nuevo.",
				"La solicitud agotó el tiempo de espera. Inténtalo de nuevo.",
				"Abrir conversación",
				"Codex es el motor principal. Haz clic para cambiar a DSH.",
				"Usar Codex como motor principal",
				"Los archivos adjuntos no están listos. Espera a que termine la carga.",
				"La ruta local del archivo adjunto no está disponible. Vuelve a seleccionar el archivo.",
				"Esta sesión está ejecutando una tarea. Deténla o espera a que termine.",
				"Tarea no válida. Introduce una tarea e inténtalo de nuevo.",
				"Primero cambia al directorio de trabajo de esta tarea.",
				"Responde a todas las preguntas para continuar.",
				"Opción de aprobación no válida. Vuelve a elegir.",
				"Esta solicitud de interacción ha caducado. Carga el estado más reciente de la tarea.",
				"Examina los originales adjuntos y aclara el trabajo necesario para esta tarea."
			],
			pt: [
				"Execução principal com Codex",
				"Pronto",
				"A iniciar",
				"Em execução",
				"A aguardar a sua resposta ou aprovação",
				"Falha na execução",
				"Parar",
				"Introduza uma tarefa abaixo. O Codex comunica diretamente consigo e utiliza as ferramentas profissionais e as bases de trabalho partilhadas.",
				"Você",
				"Execução de ferramenta",
				"A sua resposta é necessária",
				"É necessária aprovação",
				"Escolher",
				"Outro",
				"Responder e continuar",
				"Aprovar esta ação",
				"Recusar",
				"Pare a tarefa Codex atual antes de mudar de motor.",
				"A execução principal com Codex requer a aplicação de computador atualizada.",
				"Primeiro, inicie sessão na sua conta nas definições do Codex.",
				"O ambiente Codex está indisponível. Verifique a instalação da aplicação de computador.",
				"O modelo Codex selecionado está indisponível. Escolha outro modelo.",
				"A sua conta não pode usar o modelo Codex selecionado.",
				"A quota da sua conta está esgotada. Verifique-a antes de tentar novamente.",
				"O pedido falhou. Tente novamente.",
				"O Codex foi desligado. Tente novamente.",
				"O pedido excedeu o tempo limite. Tente novamente.",
				"Abrir conversa",
				"O Codex é o motor principal. Clique para mudar para DSH.",
				"Usar Codex como motor principal",
				"Os anexos ainda não estão prontos. Aguarde a conclusão do envio.",
				"O caminho local do anexo está indisponível. Selecione o ficheiro novamente.",
				"Esta sessão está a executar uma tarefa. Pare-a ou aguarde a conclusão.",
				"Tarefa inválida. Introduza uma tarefa e tente novamente.",
				"Mude primeiro para o diretório de trabalho desta tarefa.",
				"Responda a todas as perguntas para continuar.",
				"Opção de aprovação inválida. Escolha novamente.",
				"Este pedido de interação expirou. Carregue o estado mais recente da tarefa.",
				"Examine os originais anexados e esclareça o trabalho necessário para esta tarefa."
			],
			ru: [
				"Основное выполнение через Codex",
				"Готов",
				"Запуск",
				"Выполнение",
				"Ожидание вашего ответа или разрешения",
				"Ошибка выполнения",
				"Остановить",
				"Введите задачу ниже. Codex общается с вами напрямую и использует общие профессиональные инструменты и исходные данные задачи.",
				"Вы",
				"Выполнение инструмента",
				"Нужен ваш ответ",
				"Требуется разрешение",
				"Выбрать",
				"Другое",
				"Ответить и продолжить",
				"Разрешить это действие",
				"Отклонить",
				"Остановите текущую задачу Codex перед переключением движка.",
				"Для основного выполнения через Codex нужна обновлённая настольная версия приложения.",
				"Сначала войдите в свой аккаунт в настройках Codex.",
				"Среда Codex недоступна. Проверьте установку настольного приложения.",
				"Выбранная модель Codex недоступна. Выберите другую модель.",
				"Ваш аккаунт не может использовать выбранную модель Codex.",
				"Квота аккаунта исчерпана. Проверьте её перед повторной попыткой.",
				"Ошибка запроса. Повторите попытку.",
				"Соединение с Codex прервано. Повторите попытку.",
				"Время ожидания запроса истекло. Повторите попытку.",
				"Открыть разговор",
				"Codex — основной движок. Нажмите, чтобы переключиться на DSH.",
				"Использовать Codex как основной движок",
				"Вложения ещё не готовы. Дождитесь завершения загрузки.",
				"Локальный путь вложения недоступен. Выберите файл заново.",
				"В этой сессии выполняется задача. Остановите её или дождитесь завершения.",
				"Некорректная задача. Введите задачу и повторите попытку.",
				"Сначала перейдите в рабочую папку этой задачи.",
				"Ответьте на все вопросы, чтобы продолжить.",
				"Некорректный вариант разрешения. Выберите заново.",
				"Срок этого запроса истёк. Загрузите актуальное состояние задачи.",
				"Изучите приложенные оригиналы и уточните, какую работу нужно выполнить для этой задачи."
			],
			ar: [
				"التنفيذ الرئيسي عبر Codex",
				"جاهز",
				"جارٍ البدء",
				"جارٍ التنفيذ",
				"بانتظار ردك أو موافقتك",
				"فشل التنفيذ",
				"إيقاف",
				"أدخل المهمة أدناه. يتواصل Codex معك مباشرة ويستخدم الأدوات المهنية المشتركة ومعطيات المهمة.",
				"أنت",
				"تنفيذ أداة",
				"يلزم ردك",
				"تلزم الموافقة",
				"اختر",
				"غير ذلك",
				"الرد والمتابعة",
				"الموافقة على هذا الإجراء",
				"رفض",
				"أوقف مهمة Codex الحالية قبل تبديل محرك التنفيذ.",
				"يتطلب التنفيذ الرئيسي عبر Codex تطبيق سطح المكتب المحدّث.",
				"سجّل الدخول إلى حسابك أولاً من إعدادات Codex.",
				"بيئة Codex غير متاحة. تحقق من تثبيت تطبيق سطح المكتب.",
				"نموذج Codex المحدد غير متاح. اختر نموذجاً آخر.",
				"لا يحق لحسابك استخدام نموذج Codex المحدد.",
				"نفدت حصة حسابك. تحقق منها قبل إعادة المحاولة.",
				"فشل الطلب. حاول مجدداً.",
				"انقطع اتصال Codex. حاول مجدداً.",
				"انتهت مهلة الطلب. حاول مجدداً.",
				"فتح المحادثة",
				"Codex هو محرك التنفيذ الرئيسي. انقر للتبديل إلى DSH.",
				"استخدام Codex كمحرك التنفيذ الرئيسي",
				"المرفقات غير جاهزة. انتظر اكتمال الرفع.",
				"المسار المحلي للمرفق غير متاح. اختر الملف مجدداً.",
				"هذه الجلسة تنفذ مهمة. أوقفها أو انتظر اكتمالها.",
				"المهمة غير صالحة. أدخل مهمة وحاول مجدداً.",
				"انتقل أولاً إلى مجلد العمل الخاص بهذه المهمة.",
				"أجب عن جميع الأسئلة للمتابعة.",
				"خيار الموافقة غير صالح. اختر مجدداً.",
				"انتهت صلاحية طلب التفاعل. حمّل أحدث حالة للمهمة.",
				"افحص الأصول المرفقة ووضّح العمل المطلوب لهذه المهمة."
			]
		}).map(([locale, values]) => [locale, Object.fromEntries(keys.map((key, index) => [key, values[index]]))]));
		function tCodexExecution(key, language) {
			return (codexExecutionLocales[String(language || "").toLowerCase().split("-")[0]] || codexExecutionLocales.en)[key] || codexExecutionLocales.en[key] || key;
		}
		//#endregion
		//#region src/client/codex-execution.js
		function createNativeCodexExecution({ React, desktop, language, useLanguage = language, notify = () => {}, renderMessage = (text) => text, openFile }) {
			const h = React.createElement;
			const states = /* @__PURE__ */ new Map();
			const listeners = /* @__PURE__ */ new Map();
			const engines = /* @__PURE__ */ new Map();
			let unsubscribe = null;
			const current = (id) => states.get(id) || {
				sessionId: id,
				phase: "idle",
				messages: [],
				requests: []
			};
			const update = (state) => {
				if (!state?.sessionId) return;
				states.set(state.sessionId, state);
				for (const listener of listeners.get(state.sessionId) || []) listener();
				notify();
			};
			const connect = () => {
				unsubscribe ??= desktop?.onCodexExecution?.(update) || null;
			};
			const load = async (id) => {
				if (!id || !desktop?.codexExecutionStatus) return;
				connect();
				update({
					...await desktop.codexExecutionStatus(id),
					sessionId: id
				});
			};
			const subscribe = (id, listener) => {
				connect();
				const set = listeners.get(id) || /* @__PURE__ */ new Set();
				listeners.set(id, set);
				set.add(listener);
				return () => {
					set.delete(listener);
					if (!set.size) listeners.delete(id);
				};
			};
			const busy = (id) => [
				"starting",
				"running",
				"waiting"
			].includes(current(id).phase);
			const enabled = (id) => {
				if (!engines.has(id)) {
					let value = false;
					try {
						value = localStorage.getItem(`agent-pi:main-engine:${id}`) === "codex";
					} catch {}
					engines.set(id, value);
				}
				return engines.get(id) === true;
			};
			const setEnabled = (id, value) => {
				if (busy(id)) throw new Error(tCodexExecution("switchBlocked", language()));
				engines.set(id, value === true);
				try {
					localStorage.setItem(`agent-pi:main-engine:${id}`, value ? "codex" : "dsh");
				} catch {}
				notify();
			};
			async function submit(input) {
				if (!desktop?.codexExecutionSubmit) throw new Error(tCodexExecution("desktopRequired", language()));
				connect();
				return update(await desktop.codexExecutionSubmit(input));
			}
			function Question({ request, identity }) {
				const lang = useLanguage();
				const [answers, setAnswers] = React.useState({});
				const [error, setError] = React.useState("");
				const t = (key) => tCodexExecution(key, lang);
				const send = async (answer) => {
					try {
						update(await desktop.codexExecutionReply(identity, request.id, answer));
					} catch {
						setError(t("interactionExpired"));
					}
				};
				const questions = request.params.questions || [];
				return h("section", { style: {
					border: "1px solid #ccd4df",
					borderRadius: 10,
					padding: 16,
					margin: "12px 0"
				} }, h("strong", null, t(questions.length ? "answerNeeded" : "approvalNeeded")), questions.length ? questions.map((question) => h("label", {
					key: question.id,
					style: {
						display: "block",
						marginTop: 10
					}
				}, h("div", null, question.question), question.options?.length ? h("select", {
					value: answers[question.id] || "",
					onChange: (event) => setAnswers({
						...answers,
						[question.id]: event.target.value
					})
				}, h("option", { value: "" }, t("choose")), ...question.options.map((option) => h("option", {
					key: option.label,
					value: option.label
				}, option.label + (option.description ? " — " + option.description : ""))), question.isOther && h("option", { value: "__other__" }, t("other"))) : null, (!question.options?.length || answers[question.id] === "__other__") && h("input", {
					type: question.isSecret ? "password" : "text",
					value: answers[question.id + ":other"] || "",
					onChange: (event) => setAnswers({
						...answers,
						[question.id + ":other"]: event.target.value
					}),
					style: {
						width: "100%",
						marginTop: 6
					}
				}))) : h("pre", { style: {
					whiteSpace: "pre-wrap",
					wordBreak: "break-word"
				} }, JSON.stringify({
					reason: request.params.reason,
					command: request.params.command,
					changes: request.params.changes,
					permissions: request.params.permissions,
					additionalPermissions: request.params.additionalPermissions,
					networkApprovalContext: request.params.networkApprovalContext,
					grantRoot: request.params.grantRoot,
					cwd: request.params.cwd
				}, null, 2)), error && h("p", { role: "alert" }, error), questions.length ? h("button", {
					type: "button",
					onClick: () => send(Object.fromEntries(questions.map((question) => [question.id, !question.options?.length || answers[question.id] === "__other__" ? answers[question.id + ":other"] : answers[question.id]])))
				}, t("reply")) : h("div", null, h("button", {
					type: "button",
					onClick: () => send("accept")
				}, t("approve")), " ", h("button", {
					type: "button",
					onClick: () => send("decline")
				}, t("decline"))));
			}
			function View(props) {
				const lang = useLanguage();
				const id = props.sessionId || "";
				const [, tick] = React.useState(0);
				React.useEffect(() => {
					const off = subscribe(id, () => tick((value) => value + 1));
					load(id).catch((error) => update({
						...current(id),
						sessionId: id,
						error: error.message
					}));
					return off;
				}, [id]);
				const state = current(id);
				const t = (key) => tCodexExecution(key, lang);
				const identity = {
					sessionId: id,
					cwd: state.cwd
				};
				const message = (row) => {
					if (row.role === "tool") return h("details", null, h("summary", null, row.text.split("\n")[0]), h("pre", { style: { whiteSpace: "pre-wrap" } }, row.text));
					const links = /\[([^\]]+)\]\((<?(?:[A-Za-z]:[\\/]|\/)[^)\n]+)\)/g;
					const parts = [];
					let last = 0;
					for (const match of row.text.matchAll(links)) {
						parts.push(renderMessage(row.text.slice(last, match.index), state.cwd));
						const path = match[2].replace(/^</, "").replace(/>$/, "");
						parts.push(h("button", {
							type: "button",
							key: match.index,
							onClick: () => openFile ? openFile(state.cwd, path) : desktop.openPath(path)
						}, match[1]));
						last = match.index + match[0].length;
					}
					parts.push(renderMessage(row.text.slice(last), state.cwd));
					return parts;
				};
				return h("div", {
					"data-agent-pi-codex-main": id,
					style: {
						height: "100%",
						overflow: "auto",
						minWidth: 0
					}
				}, h("div", { style: {
					maxWidth: 900,
					margin: "0 auto",
					padding: 24
				} }, h("strong", null, t("main")), h("span", { style: {
					marginLeft: 12,
					color: "#697586"
				} }, t(state.phase === "idle" ? "ready" : state.phase)), busy(id) && h("button", {
					type: "button",
					style: { marginLeft: 12 },
					onClick: () => desktop.codexExecutionInterrupt(identity).then(update).catch((error) => update({
						...state,
						error: error.message
					}))
				}, t("stop")), !state.messages.length && h("p", null, t("intro")), ...state.messages.map((row) => h("article", {
					key: row.id,
					style: {
						marginTop: 20,
						padding: 14,
						borderRadius: 10,
						background: row.role === "user" ? "#eef3fa" : "transparent",
						whiteSpace: "pre-wrap",
						overflowWrap: "anywhere",
						fontSize: row.role === "tool" ? 13 : 15
					}
				}, h("div", { style: {
					fontWeight: 600,
					marginBottom: 8
				} }, row.role === "user" ? t("you") : row.role === "assistant" ? "Codex" : t("tool")), message(row))), state.error && h("p", {
					role: "alert",
					style: { color: "#b42318" }
				}, t(state.errorCode || "requestFailed")), ...state.requests.map((request) => h(Question, {
					key: request.id,
					request,
					identity
				}))));
			}
			return {
				View,
				current,
				subscribe,
				load,
				enabled,
				setEnabled,
				busy,
				submit,
				dispose() {
					unsubscribe?.();
					unsubscribe = null;
					listeners.clear();
				}
			};
		}
		//#endregion
		//#region ../../vendor/deepseek-harness/packages/util/workspace-path/src/file-address.ts
		/** The scheme and type every file address opens with. */
		const FILE_ADDRESS_PREFIX = "dsh-resource://file/";
		/** Whether a decoded first path segment is a Windows drive (`C:`). */
		function isDriveSegment(segment) {
			return segment !== void 0 && /^[A-Za-z]:$/.test(segment);
		}
		/**
		* Read a file address back into its parts without resolving `.` or `..`.
		* Query and fragment suffixes are ignored; encoded path segments are decoded.
		* @param address - a candidate address.
		* @returns the parts, or `undefined` when the string is not a `dsh-resource://file/` URI in a known scope with a path, or a segment is not validly encoded.
		*/
		function parseFileAddress(address) {
			try {
				if (!address.startsWith(FILE_ADDRESS_PREFIX)) return void 0;
				const end = address.search(/[?#]/);
				const [scope, ...rest] = address.slice(20, end === -1 ? void 0 : end).split("/");
				if (scope === "session") {
					const [id, ...segments] = rest;
					if (id === void 0 || id === "" || segments.length === 0) return void 0;
					return {
						scope,
						sessionId: decodeURIComponent(id),
						path: segments.map(decodeURIComponent).join("/")
					};
				}
				if (scope === "absolute") {
					const unc = rest[0] === "" && rest.length > 1;
					const segments = (unc ? rest.slice(1) : rest).map(decodeURIComponent);
					if (segments.length === 0 || segments[0] === "") return void 0;
					if (unc) return {
						scope,
						path: `//${segments.join("/")}`
					};
					return {
						scope,
						path: isDriveSegment(segments[0]) ? segments.join("/") : `/${segments.join("/")}`
					};
				}
				return;
			} catch {
				return;
			}
		}
		//#endregion
		//#region ../../vendor/deepseek-harness/packages/util/workspace-path/src/index.ts
		/** Whether a path uses a Windows drive or UNC prefix. */
		function isWindowsStylePath(value) {
			return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith("\\\\");
		}
		/**
		* Whether a path is absolute in either spelling the Host accepts: POSIX (`/a/b`) or Windows drive or UNC.
		* @param path - the path to classify.
		* @returns `true` for an absolute path; `false` for a Workspace-relative one.
		*/
		function isAbsoluteWorkspacePath(path) {
			return path.startsWith("/") || isWindowsStylePath(path);
		}
		/**
		* Resolve a Workspace-relative path into the Host-facing spelling used by path operations.
		* @param cwd - Session Workspace root, when known.
		* @param path - Absolute or Workspace-relative path.
		* @returns an absolute path when a Workspace root is available, otherwise the original path.
		*/
		function resolveWorkspacePath(cwd, path) {
			if (isAbsoluteWorkspacePath(path)) return path;
			if (cwd === void 0 || cwd === "") return path;
			const separator = isWindowsStylePath(cwd) && cwd.includes("\\") ? "\\" : "/";
			return `${cwd.replace(/[/\\]+$/, "")}${separator}${path.replace(/^[/\\]+/, "")}`;
		}
		//#endregion
		//#region src/client/native-work-file-preview.js
		/** Route alpha.2 delivery cards into the existing full Office/CAD viewers. */
		function installNativeWorkFilePreviews(ctx, { React, ReactDOM, FilePreviewOverlay }) {
			const h = React.createElement;
			const id = "agent-pi:work-file-preview";
			ctx.inject(["sidebarRightTabs", "sessions"], (scope) => {
				function WorkFilePreview(props) {
					const { tab } = props.useTabInfo();
					const file = parseFileAddress(tab.contentId);
					const cwd = props.useSessions((state) => file?.scope === "session" ? state.byId[file.sessionId]?.cwd || "" : "");
					const [open, setOpen] = React.useState(true);
					const showPreview = () => {
						window.dispatchEvent(new Event("agent-pi-close-preview"));
						setOpen(true);
					};
					React.useEffect(() => {
						showPreview();
					}, [tab.contentId, tab.navigation.revision]);
					React.useEffect(() => {
						const close = () => setOpen(false);
						window.addEventListener("agent-pi-close-native-preview", close);
						return () => window.removeEventListener("agent-pi-close-native-preview", close);
					}, []);
					if (!file || file.scope !== "session" || !cwd) return h("p", null, "文件所属对话尚未就绪，请重新打开该对话。");
					const name = file.path.replaceAll("\\", "/").split("/").at(-1);
					return h(React.Fragment, null, h("div", { style: { padding: 20 } }, h("p", null, name), h("button", {
						type: "button",
						onClick: showPreview
					}, "打开文件预览")), open && ReactDOM.createPortal(h(FilePreviewOverlay, {
						key: tab.contentId,
						cwd,
						file: {
							path: resolveWorkspacePath(cwd, file.path),
							name,
							type: "file"
						},
						sessionProps: {
							sessionId: file.sessionId,
							cwd
						},
						onClose: () => setOpen(false),
						onDeleted: () => setOpen(false),
						onKbSaved: () => window.dispatchEvent(new Event("agent-pi-files-changed"))
					}), document.body));
				}
				scope.effect(() => scope.sidebarRightTabs.register({
					id,
					kind: "agent-pi-work-file",
					priority: "extension",
					patterns: [
						"*.docx",
						"*.xlsx",
						"*.pptx",
						"*.univer",
						"*.dwg",
						"*.dxf",
						"*.mpp",
						"*.xer",
						"*.pmxml"
					],
					canOpen: (address) => parseFileAddress(address)?.scope === "session",
					title: (address) => parseFileAddress(address)?.path.split("/").at(-1) || address
				}));
				scope.slots.inject("sidebar.right.pane.tab", () => scope.slots.register({
					name: "sidebar.right.pane.tab",
					key: id
				}, WorkFilePreview));
			});
		}
		const nativeWorkFilePreviewCss = `
/* The native preview owns the right column while open; restore the product
   file rail when it closes, without reserving the width twice. */
html:has([data-sidebar-right-open]) .ap-files-dock{display:none}
html.ap-files-rail:has([data-sidebar-right-open]) [data-phase]{margin-right:0}
html.ap-files-rail:has([data-sidebar-right-open]) .ap-wb-page{right:0}
`;
		//#endregion
		//#region src/codex-turn.ts
		function codexTurnModel(status, selectedModel) {
			return status.models?.find((model) => model.id === (selectedModel || status.defaultModel)) ?? (!selectedModel ? status.model ?? null : null);
		}
		function codexSupportsEffort(model, effort) {
			return !!effort && model?.supportedReasoningEfforts?.some((item) => item.reasoningEffort === effort) === true;
		}
		function resolveCodexTurnSelection(status, selectedModel, selectedEffort) {
			const model = codexTurnModel(status, selectedModel);
			if (!selectedModel && status.modelError) throw new Error("无法确认默认 Codex 模型，请刷新模型列表或选择可用模型后重试。");
			if (selectedModel && !model) throw new Error("所选 Codex 模型当前不可用，请刷新模型列表并重新选择。");
			if (selectedEffort && !codexSupportsEffort(model, selectedEffort)) throw new Error("所选 Codex 思考等级当前不可用，请刷新模型列表并重新选择。");
			const inherited = codexSupportsEffort(model, status.selectedReasoningEffort) ? status.selectedReasoningEffort : codexSupportsEffort(model, model?.defaultReasoningEffort) ? model?.defaultReasoningEffort : null;
			return {
				model: selectedModel || status.defaultModel || null,
				reasoningEffort: selectedEffort || inherited || null
			};
		}
		//#endregion
		//#region src/file-icons.ts
		function extOf(file) {
			if (file.type === "directory") return "";
			const raw = String(file.name || file.path || "");
			const base = raw.split(/[\\/]/).pop() || raw;
			const dot = base.lastIndexOf(".");
			return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
		}
		/** Icon name + CSS class for the files rail. Client renders these as filled format badges. */
		function fileIconMeta(file) {
			if (file.type === "directory") return {
				name: "folder",
				klass: "ap-fico-folder"
			};
			const ext = extOf(file);
			if (ext === "md" || ext === "markdown") return {
				name: "fileMd",
				klass: "ap-fico-md"
			};
			if (ext === "txt" || ext === "log") return {
				name: "fileText",
				klass: "ap-fico-txt"
			};
			if (ext === "json" || ext === "jsonl") return {
				name: "fileJson",
				klass: "ap-fico-json"
			};
			if (ext === "xls" || ext === "xlsx" || ext === "csv" || ext === "tsv" || ext === "univer") return {
				name: "fileSheet",
				klass: "ap-fico-sheet"
			};
			if (ext === "doc" || ext === "docx") return {
				name: "fileWord",
				klass: "ap-fico-word"
			};
			if (ext === "ppt" || ext === "pptx") return {
				name: "filePpt",
				klass: "ap-fico-ppt"
			};
			if (ext === "pdf") return {
				name: "filePdf",
				klass: "ap-fico-pdf"
			};
			if (ext === "html" || ext === "htm") return {
				name: "fileHtml",
				klass: "ap-fico-html"
			};
			if (/^(png|jpe?g|gif|webp|bmp|svg|ico)$/.test(ext)) return {
				name: "image",
				klass: "ap-fico-img"
			};
			return {
				name: "file",
				klass: "ap-fico-file"
			};
		}
		function fileIconName(file) {
			return fileIconMeta(file).name;
		}
		function fileIconClass(file) {
			return fileIconMeta(file).klass;
		}
		//#endregion
		//#region src/md-preview.ts
		function isPipeTableRow$1(line) {
			return /^\s*\|.+\|\s*$/.test(line);
		}
		/** Linear check: every cell is :--- / --- / ---: / :---:. Avoids ReDoS on long pipe rows. */
		function isPipeSeparatorRow$1(line) {
			const trimmed = String(line).trim();
			if (!trimmed.includes("|") || !trimmed.includes("-")) return false;
			const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|");
			return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell.trim()));
		}
		const HEAVY_MD_CHARS = 8e4;
		const HEAVY_TABLE_ROWS = 150;
		const PREVIEW_HEAD_CHARS = 6e4;
		/** True when live HTML preview / WYSIWYG would likely crash the renderer. */
		function previewIsHeavy(markdown) {
			const text = String(markdown || "");
			if (text.length > HEAVY_MD_CHARS) return true;
			let rows = 0;
			for (const line of text.split("\n")) if (isPipeTableRow$1(line)) {
				rows += 1;
				if (rows > HEAVY_TABLE_ROWS) return true;
			}
			return false;
		}
		function collectPipeTables(markdown) {
			const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
			const tables = [];
			let i = 0;
			while (i < lines.length) {
				if (isPipeTableRow$1(lines[i]) && i + 1 < lines.length && isPipeSeparatorRow$1(lines[i + 1])) {
					const start = i;
					i += 2;
					while (i < lines.length && isPipeTableRow$1(lines[i])) i += 1;
					tables.push(lines.slice(start, i).join("\n"));
					continue;
				}
				i += 1;
			}
			return tables;
		}
		/**
		* WYSIWYG only paints the capped table head. Put hidden original rows back
		* so saving the overlay does not truncate a BOQ.
		*/
		function restoreCappedTables(edited, original) {
			const fromOriginal = collectPipeTables(original);
			const fromEdited = collectPipeTables(edited);
			if (!fromOriginal.length || fromEdited.length !== fromOriginal.length) return edited;
			let index = 0;
			const lines = String(edited || "").replace(/\r\n/g, "\n").split("\n");
			const out = [];
			let i = 0;
			while (i < lines.length) {
				if (isPipeTableRow$1(lines[i]) && i + 1 < lines.length && isPipeSeparatorRow$1(lines[i + 1])) {
					const start = i;
					i += 2;
					while (i < lines.length && isPipeTableRow$1(lines[i])) i += 1;
					const next = fromEdited[index] || lines.slice(start, i).join("\n");
					const orig = fromOriginal[index] || next;
					index += 1;
					const nextRows = next.split("\n");
					const origRows = orig.split("\n");
					out.push(origRows.length > nextRows.length ? nextRows.concat(origRows.slice(nextRows.length)).join("\n") : next);
					continue;
				}
				out.push(lines[i]);
				i += 1;
			}
			return out.join("\n");
		}
		/** First paint of a huge manuscript: keep a line-bounded head, leave the rest for expand / source. */
		function slicePreviewMarkdown(markdown, maxChars = PREVIEW_HEAD_CHARS) {
			const text = String(markdown || "");
			if (text.length <= maxChars) return {
				text,
				truncated: false,
				originalChars: text.length
			};
			let cut = text.lastIndexOf("\n", maxChars);
			if (cut < Math.floor(maxChars * .6)) cut = maxChars;
			return {
				text: text.slice(0, cut),
				truncated: true,
				originalChars: text.length
			};
		}
		/** Brand MutationObserver must not walk the document preview subtree. */
		function isInsideApDoc(node) {
			if (!node) return false;
			let el = node;
			if (el.nodeType === 3) el = el.parentElement || el.parentNode;
			if (!el || typeof el.closest !== "function") return false;
			return !!el.closest(".ap-doc");
		}
		//#endregion
		//#region src/selection-rewrite.ts
		/** Send a preview selection rewrite into the parent session, not a side chat. */
		function buildPreviewSelectionFollowup(input) {
			const filePath = String(input.filePath || "").trim();
			const instruction = String(input.instruction || "").trim();
			const selected = String(input.selectedText || "").trim();
			if (!filePath || !instruction || !selected) throw new Error("file path, selection, and instruction are required");
			return `【预览选区修改 — 请在本主会话继续，使用本项目记忆】

文件: ${filePath}
用户要求: ${instruction}

<selected_text>
${selected.length > 8e3 ? `${selected.slice(0, 8e3)}\n…(选区已截断)` : selected}
</selected_text>

请直接改这个文件并保存。不要另开对话，不要只口头改一版。改完用一句话说明改了什么。`;
		}
		//#endregion
		//#region src/session-transaction.ts
		function requireSessionId(sessionId) {
			const value = String(sessionId || "").trim();
			if (!value) throw new Error("session transaction requires a session id");
			return value;
		}
		function copy(value) {
			return { ...value };
		}
		/**
		* In-memory, per-session transaction registry for product-layer automation.
		* Nothing may run after prepare alone: the user action must explicitly commit it.
		*/
		function createSessionTransactionRegistry(now = Date.now, restored = []) {
			const entries = /* @__PURE__ */ new Map();
			for (const value of restored) {
				const sessionId = String(value?.sessionId || "").trim();
				if (!sessionId || value.phase !== "committed" || value.payload == null) continue;
				entries.set(sessionId, copy({
					...value,
					sessionId
				}));
			}
			const current = (sessionId) => {
				const id = requireSessionId(sessionId);
				const value = entries.get(id);
				if (!value) throw new Error(`session transaction not prepared: ${id}`);
				return value;
			};
			return {
				get(sessionId) {
					const value = entries.get(String(sessionId || "").trim());
					return value ? copy(value) : void 0;
				},
				prepare(sessionId, payload) {
					const id = requireSessionId(sessionId);
					const previous = entries.get(id);
					if (previous?.phase === "prepared" || previous?.phase === "committed") throw new Error(`session transaction already active: ${id}`);
					const value = {
						sessionId: id,
						phase: "prepared",
						payload,
						preparedAt: now()
					};
					entries.set(id, value);
					return copy(value);
				},
				commit(sessionId) {
					const value = current(sessionId);
					if (value.phase !== "prepared") throw new Error(`session transaction cannot commit from ${value.phase}`);
					value.phase = "committed";
					value.committedAt = now();
					return copy(value);
				},
				succeed(sessionId) {
					const value = current(sessionId);
					if (value.phase !== "committed") throw new Error(`session transaction cannot succeed from ${value.phase}`);
					value.phase = "succeeded";
					value.settledAt = now();
					delete value.error;
					return copy(value);
				},
				fail(sessionId, error) {
					const value = current(sessionId);
					if (value.phase !== "prepared" && value.phase !== "committed") throw new Error(`session transaction cannot fail from ${value.phase}`);
					value.phase = "failed";
					value.settledAt = now();
					value.error = String(error instanceof Error ? error.message : error || "unknown error");
					return copy(value);
				},
				destroy(sessionId) {
					const id = requireSessionId(sessionId);
					const value = entries.get(id);
					if (!value) return void 0;
					value.phase = "destroyed";
					value.settledAt = now();
					entries.delete(id);
					return copy(value);
				},
				canRun(sessionId) {
					return entries.get(String(sessionId || "").trim())?.phase === "committed";
				},
				committed() {
					return [...entries.values()].filter((value) => value.phase === "committed").map(copy);
				}
			};
		}
		//#endregion
		//#region src/client/index.js
		const h = react.createElement;
		const AgentTeamsSettings = createAgentTeamsSettings(react);
		const SearchSettings = createSearchSettings(react);
		const { api, apiBlob, downloadBlob, rawFileUrl } = createAgentPiApiClient();
		const MARKUP_RE = /[`*!\[]/;
		const HTML_SPECIAL_RE = /[&<>"]/;
		const css = clientCss + professionalDepthCss + taskProcessCss + nativeWorkFilePreviewCss + taskGuideCss;
		if (typeof document !== "undefined") {
			const existing = document.querySelector("style[data-plugin-css=\"dsh-tender-web\"]");
			if (existing) existing.remove();
			const tag = document.createElement("style");
			tag.dataset.pluginCss = "dsh-tender-web";
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		const ICONS = {
			settings: [["path", { d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" }], ["circle", {
				cx: 12,
				cy: 12,
				r: 3
			}]],
			clipboardCheck: [
				["rect", {
					width: 8,
					height: 4,
					x: 8,
					y: 2,
					rx: 1,
					ry: 1
				}],
				["path", { d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" }],
				["path", { d: "m9 14 2 2 4-4" }]
			],
			clipboardList: [
				["rect", {
					width: 8,
					height: 4,
					x: 8,
					y: 2,
					rx: 1,
					ry: 1
				}],
				["path", { d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" }],
				["path", { d: "M12 11h4" }],
				["path", { d: "M12 16h4" }],
				["path", { d: "M8 11h.01" }],
				["path", { d: "M8 16h.01" }]
			],
			book: [["path", { d: "M12 7v14" }], ["path", { d: "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" }]],
			landmark: [
				["line", {
					x1: 3,
					x2: 21,
					y1: 22,
					y2: 22
				}],
				["line", {
					x1: 6,
					x2: 6,
					y1: 18,
					y2: 11
				}],
				["line", {
					x1: 10,
					x2: 10,
					y1: 18,
					y2: 11
				}],
				["line", {
					x1: 14,
					x2: 14,
					y1: 18,
					y2: 11
				}],
				["line", {
					x1: 18,
					x2: 18,
					y1: 18,
					y2: 11
				}],
				["polygon", { points: "12 2 20 7 4 7" }]
			],
			plus: [["path", { d: "M5 12h14" }], ["path", { d: "M12 5v14" }]],
			refresh: [
				["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }],
				["path", { d: "M21 3v5h-5" }],
				["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }],
				["path", { d: "M8 16H3v5" }]
			],
			folder: [["path", { d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" }]],
			message: [["path", { d: "M7.9 20A9 9 0 1 0 4 16.1L2 22Z" }]],
			layout: [
				["rect", {
					width: 7,
					height: 18,
					x: 3,
					y: 3,
					rx: 1
				}],
				["rect", {
					width: 7,
					height: 8,
					x: 14,
					y: 3,
					rx: 1
				}],
				["rect", {
					width: 7,
					height: 8,
					x: 14,
					y: 13,
					rx: 1
				}]
			],
			list: [
				["path", { d: "M8 6h13" }],
				["path", { d: "M8 12h13" }],
				["path", { d: "M8 18h13" }],
				["path", { d: "M3 6h.01" }],
				["path", { d: "M3 12h.01" }],
				["path", { d: "M3 18h.01" }]
			],
			unlock: [["rect", {
				width: 18,
				height: 11,
				x: 3,
				y: 11,
				rx: 2,
				ry: 2
			}], ["path", { d: "M7 11V7a5 5 0 0 1 9.9-1" }]],
			arrow: [["path", { d: "M5 12h14" }], ["path", { d: "m12 5 7 7-7 7" }]],
			filePlus: [
				["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }],
				["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }],
				["path", { d: "M9 15h6" }],
				["path", { d: "M12 18v-6" }]
			],
			play: [["circle", {
				cx: 12,
				cy: 12,
				r: 10
			}], ["polygon", { points: "10 8 16 12 10 16" }]],
			search: [["circle", {
				cx: 11,
				cy: 11,
				r: 8
			}], ["path", { d: "m21 21-4.3-4.3" }]],
			lock: [["rect", {
				width: 18,
				height: 11,
				x: 3,
				y: 11,
				rx: 2,
				ry: 2
			}], ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4" }]],
			square: [["rect", {
				width: 18,
				height: 18,
				x: 3,
				y: 3,
				rx: 2
			}]],
			plusSquare: [
				["rect", {
					width: 18,
					height: 18,
					x: 3,
					y: 3,
					rx: 2
				}],
				["path", { d: "M8 12h8" }],
				["path", { d: "M12 8v8" }]
			],
			sparkles: [
				["path", { d: "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" }],
				["path", { d: "M20 2v4" }],
				["path", { d: "M22 4h-4" }],
				["circle", {
					cx: 4,
					cy: 20,
					r: 2
				}]
			],
			paperclip: [["path", { d: "M13.234 20.252 21 12.3" }], ["path", { d: "m16 6-8.414 8.586a2 2 0 0 0 0 2.828 2 2 0 0 0 2.828 0l8.414-8.586a4 4 0 0 0 0-5.656 4 4 0 0 0-5.656 0l-8.415 8.585a6 6 0 1 0 8.486 8.486" }]],
			file: [["rect", {
				x: 3,
				y: 2,
				width: 18,
				height: 20,
				rx: 3,
				fill: "currentColor",
				stroke: "none"
			}], ["path", {
				d: "M8 9h8M8 13h6",
				stroke: "#fff",
				fill: "none",
				strokeWidth: 1.8
			}]],
			fileText: [["rect", {
				x: 3,
				y: 2,
				width: 18,
				height: 20,
				rx: 3,
				fill: "currentColor",
				stroke: "none"
			}], ["path", {
				d: "M7 8h10M7 12h10M7 16h7",
				stroke: "#fff",
				fill: "none",
				strokeWidth: 1.8
			}]],
			fileMd: [["rect", {
				x: 3,
				y: 2,
				width: 18,
				height: 20,
				rx: 3,
				fill: "currentColor",
				stroke: "none"
			}], ["path", {
				d: "M7.5 16V8l4.5 6 4.5-6v8",
				stroke: "#fff",
				fill: "none",
				strokeWidth: 1.8
			}]],
			fileSheet: [
				["rect", {
					x: 3,
					y: 2,
					width: 18,
					height: 20,
					rx: 3,
					fill: "currentColor",
					stroke: "none"
				}],
				["rect", {
					x: 6.5,
					y: 6.5,
					width: 11,
					height: 3.4,
					rx: .4,
					fill: "#fff",
					stroke: "none"
				}],
				["path", {
					d: "M7 13h10M7 16.5h10M10.5 10v7M14.5 10v7",
					stroke: "#fff",
					fill: "none",
					strokeWidth: 1.6
				}]
			],
			fileWord: [["rect", {
				x: 3,
				y: 2,
				width: 18,
				height: 20,
				rx: 3,
				fill: "currentColor",
				stroke: "none"
			}], ["path", {
				d: "m7.4 8 2.3 9 2.3-5.6 2.3 5.6 2.3-9",
				stroke: "#fff",
				fill: "none",
				strokeWidth: 1.8
			}]],
			filePpt: [["rect", {
				x: 3,
				y: 2,
				width: 18,
				height: 20,
				rx: 3,
				fill: "currentColor",
				stroke: "none"
			}], ["polygon", {
				points: "9,8 17,12 9,16",
				fill: "#fff",
				stroke: "none"
			}]],
			filePdf: [["rect", {
				x: 3,
				y: 2,
				width: 18,
				height: 20,
				rx: 3,
				fill: "currentColor",
				stroke: "none"
			}], ["path", {
				d: "M8 17V8h4.4a2.7 2.7 0 0 1 0 5.4H8",
				stroke: "#fff",
				fill: "none",
				strokeWidth: 1.8
			}]],
			fileHtml: [["rect", {
				x: 3,
				y: 2,
				width: 18,
				height: 20,
				rx: 3,
				fill: "currentColor",
				stroke: "none"
			}], ["path", {
				d: "m9 8-3.2 4L9 16M15 8l3.2 4L15 16",
				stroke: "#fff",
				fill: "none",
				strokeWidth: 1.8
			}]],
			fileJson: [["rect", {
				x: 3,
				y: 2,
				width: 18,
				height: 20,
				rx: 3,
				fill: "currentColor",
				stroke: "none"
			}], ["path", {
				d: "M10 7c-2 0-2 2-2 3s0 2-1.6 2C8 12 8 13 8 14s0 3 2 3M14 7c2 0 2 2 2 3s0 2 1.6 2C16 12 16 13 16 14s0 3-2 3",
				stroke: "#fff",
				fill: "none",
				strokeWidth: 1.7
			}]],
			chevron: [["path", { d: "m9 18 6-6-6-6" }]],
			panelRight: [["rect", {
				width: 18,
				height: 18,
				x: 3,
				y: 3,
				rx: 2
			}], ["path", { d: "M15 3v18" }]],
			x: [["path", { d: "M18 6 6 18" }], ["path", { d: "m6 6 12 12" }]],
			pencil: [["path", { d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" }], ["path", { d: "m15 5 4 4" }]],
			eye: [["path", { d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" }], ["circle", {
				cx: 12,
				cy: 12,
				r: 3
			}]],
			image: [
				["rect", {
					x: 3,
					y: 2,
					width: 18,
					height: 20,
					rx: 3,
					fill: "currentColor",
					stroke: "none"
				}],
				["circle", {
					cx: 9,
					cy: 9,
					r: 1.7,
					fill: "#fff",
					stroke: "none"
				}],
				["path", {
					d: "m6.5 17 3.4-3.6 2.6 2.4 2.4-2.2 2.6 3.4",
					stroke: "#fff",
					fill: "none",
					strokeWidth: 1.6
				}]
			],
			copy: [["rect", {
				width: 14,
				height: 14,
				x: 8,
				y: 8,
				rx: 2,
				ry: 2
			}], ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }]],
			trash: [
				["path", { d: "M3 6h18" }],
				["path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }],
				["path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }]
			],
			archive: [
				["rect", {
					width: 20,
					height: 5,
					x: 2,
					y: 3,
					rx: 1
				}],
				["path", { d: "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" }],
				["path", { d: "M10 12h4" }]
			],
			save: [
				["path", { d: "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" }],
				["path", { d: "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" }],
				["path", { d: "M7 3v4a1 1 0 0 0 1 1h7" }]
			],
			download: [
				["path", { d: "M12 17V3" }],
				["path", { d: "m6 11 6 6 6-6" }],
				["path", { d: "M19 21H5" }]
			],
			export: [["path", { d: "M7 7h10v10" }], ["path", { d: "M7 17 17 7" }]]
		};
		function Icon(name, size, className) {
			const nodes = ICONS[name] || [];
			return h("svg", {
				className: ["ap-icon", className].filter(Boolean).join(" "),
				width: size || 16,
				height: size || 16,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true"
			}, nodes.map((node, i) => h(node[0], Object.assign({ key: i }, node[1]))));
		}
		function localeIdOf(value) {
			const primary = String(value || "").toLowerCase().split("-")[0];
			return AP_LANGUAGE_DEFINITIONS.some((language) => language.id === primary) ? primary : "zh";
		}
		function initialApLang() {
			try {
				const stored = localStorage.getItem("agent-pi:language:v1");
				if (stored) return localeIdOf(stored);
			} catch {}
			try {
				return localeIdOf(navigator.language);
			} catch {
				return "zh";
			}
		}
		const langState = {
			lang: initialApLang(),
			listeners: /* @__PURE__ */ new Set()
		};
		function applyDocumentLanguage(next) {
			if (typeof document === "undefined") return;
			const language = AP_LANGUAGE_DEFINITIONS.find((entry) => entry.id === next) || AP_LANGUAGE_DEFINITIONS[0];
			document.documentElement.setAttribute("lang", language.documentLang);
			document.documentElement.setAttribute("dir", language.rtl ? "rtl" : "ltr");
		}
		function setApLang(lang) {
			const next = localeIdOf(lang);
			applyDocumentLanguage(next);
			try {
				localStorage.setItem("agent-pi:language:v1", next);
			} catch {}
			if (langState.lang === next) return;
			langState.lang = next;
			langState.listeners.forEach((fn) => fn(next));
		}
		applyDocumentLanguage(langState.lang);
		function tAp(key, vars) {
			const dict = AP_I18N[langState.lang] || AP_I18N.en;
			const fallback = langState.lang === "zh" ? AP_I18N.zh : AP_I18N.en;
			let text = dict[key] || fallback[key] || key;
			if (vars && typeof vars === "object") Object.keys(vars).forEach((name) => {
				text = text.split("{" + name + "}").join(String(vars[name]));
			});
			return text;
		}
		function workbenchText(value) {
			return localizeWorkbenchCopy(value, langState.lang);
		}
		const productCapabilities = createProductCapabilities(react);
		function useApLang() {
			const [lang, setLang] = react.useState(langState.lang);
			react.useEffect(() => {
				langState.listeners.add(setLang);
				return () => langState.listeners.delete(setLang);
			}, []);
			return lang;
		}
		const MODULES = {
			tender: {
				id: "tender",
				labelZh: "投标工作台",
				icon: "clipboardCheck",
				builtin: true,
				disabled: false
			},
			delivery: {
				id: "delivery",
				labelZh: "项目实施控制",
				icon: "clipboardList",
				builtin: true,
				disabled: false
			},
			investment: {
				id: "investment",
				labelZh: "资源投资研究",
				icon: "landmark",
				builtin: true,
				disabled: false
			}
		};
		function moduleLabel(info) {
			if (!info) return "";
			if (info.id && AP_I18N.zh["module." + info.id]) return tAp("module." + info.id);
			if (langState.lang !== "zh" && (info.labelEn || info.label)) return info.labelEn || info.label;
			return info.labelZh || info.label || info.id || "";
		}
		function moduleIconNode(info, size) {
			const name = info && info.icon;
			if (name && ICONS[name]) return Icon(name, size);
			if (name && /[^\x00-\x7F]/.test(name)) return h("span", {
				className: "ap-mod-emoji",
				style: { fontSize: (size || 15) + "px" }
			}, name);
			return Icon("clipboardCheck", size);
		}
		function moduleList(data) {
			return (data && Array.isArray(data.modules) ? data.modules : Object.values(MODULES)).filter((item) => !item.disabled);
		}
		function normPath(value) {
			return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
		}
		function sessionHint(props) {
			return props && (props.sessionId || props.session && props.session.sessionId) || "";
		}
		const codexTurnControllers = window.__apCodexTurnControllers || (window.__apCodexTurnControllers = /* @__PURE__ */ new Map());
		const codexTurnListeners = window.__apCodexTurnListeners || (window.__apCodexTurnListeners = /* @__PURE__ */ new Set());
		const nativeCodex = createNativeCodexExecution({
			React: react,
			desktop: window.agentPiDesktop,
			language: () => langState.lang,
			useLanguage: useApLang,
			notify: notifyCodexTurn,
			renderMessage: (text, cwd) => h("div", { dangerouslySetInnerHTML: { __html: mdToHtml(text, { cwd }) } }),
			openFile: (cwd, path) => window.dispatchEvent(new CustomEvent("agent-pi-open-file", { detail: {
				cwd,
				path
			} }))
		});
		const attachmentTurnControllers = window.__apAttachmentTurnControllers || (window.__apAttachmentTurnControllers = /* @__PURE__ */ new Map());
		function codexTurnKey(props) {
			return sessionHint(props) || runtime.sessionId || "active";
		}
		function notifyCodexTurn() {
			codexTurnListeners.forEach((listener) => {
				try {
					listener();
				} catch {}
			});
		}
		function createCodexTurnController(latestProps) {
			return {
				phase: "idle",
				selectedModel: "",
				selectedReasoningEffort: "",
				capturedModel: null,
				capturedReasoningEffort: null,
				capturedNativeAttachmentIds: [],
				latestProps: latestProps || null,
				attemptToken: null,
				originalDraft: "",
				framedDraft: "",
				capturedAttachmentIds: [],
				capturedAttachments: [],
				preSubmitUserNodeWatermark: -1,
				preSubmitPromptErrorRef: null,
				preSubmitPromptErrorToken: "null",
				promptErrorBaselineCleared: false,
				lastInputPhase: null,
				lastInputDraftRev: null,
				sawSubmitting: false,
				acceptedDraft: null,
				acceptedDraftRev: null,
				cwd: "",
				inputStore: null,
				unsubscribeSession: null,
				unsubscribeInput: null
			};
		}
		function codexTurnController(props, create) {
			const key = codexTurnKey(props);
			let controller = codexTurnControllers.get(key);
			if (!controller && create) {
				controller = createCodexTurnController(props);
				codexTurnControllers.set(key, controller);
			}
			return controller || null;
		}
		function trackCodexTurnProps(props) {
			const controller = codexTurnControllers.get(codexTurnKey(props));
			if (controller && controller.phase !== "disposed") controller.latestProps = props;
		}
		function codexTurnPhase(props) {
			if (nativeCodex.enabled(codexTurnKey(props))) return "armed";
			const controller = codexTurnController(props, false);
			return controller ? controller.phase : "idle";
		}
		function codexTurnArmed(props) {
			return nativeCodex.enabled(codexTurnKey(props));
		}
		function setCodexTurnModel(props, model, status) {
			const controller = codexTurnController(props, true);
			if (controller.phase !== "idle" && controller.phase !== "armed") return;
			controller.selectedModel = String(model || "");
			if (!codexSupportsEffort(codexTurnModel(status || {}, controller.selectedModel), controller.selectedReasoningEffort)) controller.selectedReasoningEffort = "";
			notifyCodexTurn();
		}
		function setCodexTurnReasoningEffort(props, effort) {
			const controller = codexTurnController(props, true);
			if (controller.phase !== "idle" && controller.phase !== "armed") return;
			controller.selectedReasoningEffort = String(effort || "");
			notifyCodexTurn();
		}
		function setCodexTurnArmed(props, armed) {
			const key = codexTurnKey(props);
			if (!isLiveSessionId(key)) {
				showToast(tCodexExecution("openConversation", langState.lang));
				return;
			}
			if (armed && attachmentTurnControllers.has(key)) {
				showToast(workbenchText("当前会话已有附件发送事务，请等待完成后再切换 Codex 执行"));
				return;
			}
			const controller = codexTurnController(props, armed);
			if (!controller) return;
			controller.latestProps = props;
			try {
				nativeCodex.setEnabled(key, armed);
			} catch (error) {
				showToast(error.message);
				return;
			}
			controller.phase = armed ? "armed" : "idle";
			if (armed) openNativeCodexView();
			notifyCodexTurn();
		}
		function openNativeCodexView() {
			requestAnimationFrame(() => {
				[...document.querySelectorAll("[data-conversation-tabs] [role=\"tab\"]")].find((item) => item.textContent.trim() === "Codex")?.click();
			});
		}
		function disposeCodexTurnInputSubscription(controller) {
			const unsubscribeInput = controller.unsubscribeInput;
			controller.unsubscribeInput = null;
			if (typeof unsubscribeInput === "function") try {
				unsubscribeInput();
			} catch {}
		}
		function disposeCodexTurnSessionSubscription(controller) {
			const unsubscribeSession = controller.unsubscribeSession;
			controller.unsubscribeSession = null;
			if (typeof unsubscribeSession === "function") try {
				unsubscribeSession();
			} catch {}
		}
		function resetCodexTurnAttempt(key, controller) {
			cancelAttachmentTurnHost(key, controller);
			clearAttachmentTurnStatus(controller.attemptToken);
			disposeCodexTurnInputSubscription(controller);
			controller.attemptToken = null;
			controller.originalDraft = "";
			controller.framedDraft = "";
			controller.capturedModel = null;
			controller.capturedReasoningEffort = null;
			controller.capturedNativeAttachmentIds = [];
			controller.capturedAttachmentIds = [];
			controller.capturedAttachments = [];
			controller.preSubmitUserNodeWatermark = -1;
			controller.preSubmitPromptErrorRef = null;
			controller.preSubmitPromptErrorToken = "null";
			controller.promptErrorBaselineCleared = false;
			controller.lastInputPhase = null;
			controller.lastInputDraftRev = null;
			controller.sawSubmitting = false;
			controller.acceptedDraft = null;
			controller.acceptedDraftRev = null;
			controller.cwd = "";
			controller.inputStore = null;
		}
		function rearmCodexTurn(key, controller) {
			if (codexTurnControllers.get(key) !== controller || controller.phase === "disposed") return;
			resetCodexTurnAttempt(key, controller);
			controller.phase = "armed";
			notifyCodexTurn();
		}
		function codexTurnAuthorities(sessionId) {
			const sessions = runtime.sessions;
			const conversation = runtime.conversation;
			if (!sessions || !conversation || !conversation.input || typeof sessions.scope !== "function" || typeof conversation.input.for !== "function") throw new Error("Codex public stores unavailable");
			const scope = sessions.scope(sessionId);
			if (!scope) return null;
			const binding = typeof sessions.binding === "function" ? sessions.binding(sessionId) : null;
			const session = typeof sessions.sessionOf === "function" ? sessions.sessionOf(scope) : binding && binding.session;
			const input = conversation.input.for(scope);
			return {
				scope,
				session,
				inputStore: input && input.state
			};
		}
		function chatSourceById(sessionId) {
			const sessions = runtime.sessions;
			const uiConversation = runtime.uiConversation;
			if (!sessionId || !sessions || !uiConversation || typeof sessions.binding !== "function" || typeof uiConversation.binding !== "function") return null;
			try {
				const binding = sessions.binding(sessionId);
				return binding ? uiConversation.binding(binding).target("chat") : null;
			} catch {
				return null;
			}
		}
		function sessionSnapshotWithChat(sessionId, session) {
			const snapshot = session && typeof session.getSnapshot === "function" ? session.getSnapshot() : null;
			const source = chatSourceById(sessionId);
			const chat = source && typeof source.getSnapshot === "function" ? source.getSnapshot() : null;
			return chat ? {
				...snapshot || {},
				chat
			} : snapshot;
		}
		function subscribeSessionWithChat(sessionId, session, listener) {
			const unsubscribers = [];
			try {
				const sessionUnsubscribe = session && typeof session.subscribe === "function" ? session.subscribe(listener) : null;
				if (typeof sessionUnsubscribe === "function") unsubscribers.push(sessionUnsubscribe);
				const source = chatSourceById(sessionId);
				const chatUnsubscribe = source && typeof source.subscribe === "function" ? source.subscribe(listener) : null;
				if (typeof chatUnsubscribe === "function") unsubscribers.push(chatUnsubscribe);
			} catch (error) {
				unsubscribers.splice(0).forEach((unsubscribe) => {
					try {
						unsubscribe();
					} catch {}
				});
				throw error;
			}
			if (!unsubscribers.length) return null;
			return () => unsubscribers.splice(0).forEach((unsubscribe) => {
				try {
					unsubscribe();
				} catch {}
			});
		}
		function codexUserNode(snapshot, controller) {
			const nodes = sessionNodes(snapshot);
			for (const node of nodes) {
				if (!node || node.kind !== "user" || typeof node.seq !== "number" || node.seq <= controller.preSubmitUserNodeWatermark) continue;
				if ((node.content || []).filter((part) => part && part.type === "text").map((part) => part.text).join("") === controller.framedDraft) return true;
			}
			return false;
		}
		function codexUserNodeWatermark(snapshot) {
			let watermark = -1;
			for (const node of sessionNodes(snapshot)) if (node && node.kind === "user" && typeof node.seq === "number") watermark = Math.max(watermark, node.seq);
			return watermark;
		}
		function codexAttachmentIds(items) {
			return (items || []).map(codexAttachmentToken);
		}
		function sameCodexAttachmentIds(left, right) {
			if (left.length !== right.length) return false;
			for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false;
			return true;
		}
		function nativeCodexAttachmentIds(input) {
			if (Array.isArray(input && input.attachmentIds)) return input.attachmentIds.slice();
			return Array.isArray(input && input.imageIds) ? input.imageIds.slice() : [];
		}
		function failCodexTurn(key, controller, inputStore) {
			if (codexTurnControllers.get(key) !== controller || controller.phase === "disposed") return;
			let ownsFramedDraft = false;
			const authoritativeInputStore = inputStore || controller.inputStore;
			try {
				ownsFramedDraft = submissionOwnsDraft(controller, authoritativeInputStore && authoritativeInputStore.getSnapshot());
			} catch {}
			const originalDraft = controller.originalDraft;
			const live = controller.latestProps;
			rearmCodexTurn(key, controller);
			if (ownsFramedDraft) try {
				setComposerDraft(live, originalDraft);
			} catch {}
		}
		function clearCodexTurnAfterSubmit(key, controller) {
			if (codexTurnControllers.get(key) !== controller || controller.phase !== "submitting") return;
			const capturedIds = controller.capturedAttachmentIds.slice();
			const remainingIds = capturedIds.slice();
			const remaining = codexAttachItems(key).filter((item) => {
				const index = remainingIds.indexOf(codexAttachmentToken(item));
				if (index < 0) return true;
				remainingIds.splice(index, 1);
				return false;
			});
			resetCodexTurnAttempt(key, controller);
			disposeCodexTurnSessionSubscription(controller);
			controller.phase = "idle";
			controller.selectedModel = "";
			controller.selectedReasoningEffort = "";
			if (capturedIds.length) setCodexAttachItems(key, remaining);
			notifyCodexTurn();
		}
		const composerPropsRef = { current: null };
		const composerFace = {
			sessionId: "",
			cwd: "",
			draft: "",
			inputActions: null,
			input: null,
			session: null
		};
		function snapshotComposer() {
			return {
				sessionId: composerFace.sessionId || runtime.sessionId || "",
				cwd: composerFace.cwd || runtime.cwd || "",
				input: composerFace.input || { draft: composerFace.draft || "" },
				inputActions: composerFace.inputActions,
				session: composerFace.session
			};
		}
		function cwdFromWorkspaceItems(items, sessionId) {
			if (!sessionId) return "";
			const list = items || [];
			for (let i = 0; i < list.length; i++) {
				const item = list[i];
				const ids = item && item.sessionIds;
				if (item && item.path && ids && ids.indexOf(sessionId) >= 0) return item.path;
			}
			return "";
		}
		function captureComposerFace(props) {
			if (!props) return runtime.cwd || composerFace.cwd || "";
			const previousSessionId = runtime.sessionId || composerFace.sessionId || "";
			const hinted = sessionHint(props);
			let sessionId = hinted;
			let sessionCwd = "";
			if (typeof props.useSessions === "function") {
				sessionId = props.useSessions((s) => hinted || mainSessionId(s) || "") || hinted;
				sessionCwd = props.useSessions((s) => {
					const id = hinted || mainSessionId(s) || "";
					const row = id && s && s.byId ? s.byId[id] : null;
					return row && row.cwd ? row.cwd : "";
				}) || "";
			}
			let workspacePath = "";
			if (typeof props.useWorkspaces === "function") workspacePath = props.useWorkspaces((w) => cwdFromWorkspaceItems(w && w.items, sessionId)) || "";
			let draft = composerFace.draft || "";
			if (props.input && typeof props.input.draft === "string") draft = props.input.draft;
			else if (typeof props.useInput === "function") try {
				draft = props.useInput((s) => s && s.draft || "") || "";
			} catch {}
			if (sessionId) {
				runtime.sessionId = sessionId;
				composerFace.sessionId = sessionId;
				if (sessionId !== previousSessionId) {
					const sessionItems = attachItemsOf(sessionId);
					attachState.items = sessionItems;
					attachState.last = sessionItems;
					Promise.resolve().then(() => {
						if (activeSessionId() === sessionId) notifyAttach();
					});
				}
			}
			const changedSession = Boolean(previousSessionId && sessionId && sessionId !== previousSessionId);
			const cwd = sessionCwd || workspacePath || (changedSession ? "" : runtime.cwd) || "";
			if (cwd) {
				runtime.cwd = cwd;
				composerFace.cwd = cwd;
			} else if (changedSession) {
				runtime.cwd = "";
				composerFace.cwd = "";
			}
			if (typeof draft === "string") {
				composerFace.draft = draft;
				composerFace.input = props.input && typeof props.input.draft === "string" ? props.input : { draft };
			}
			if (props.inputActions) composerFace.inputActions = props.inputActions;
			if (props.session) composerFace.session = props.session;
			composerPropsRef.current = snapshotComposer();
			ensureUserRequirementWatcher(sessionId);
			return cwd;
		}
		function readWorkspaceCwd(props) {
			return captureComposerFace(props);
		}
		function workspaceCwd(props) {
			const direct = props && typeof props.cwd === "string" ? props.cwd : "";
			if (direct) return direct;
			const hinted = sessionHint(props);
			if (hinted && hinted !== activeSessionId()) return "";
			return runtime.cwd || composerFace.cwd || "";
		}
		function activeSessionId() {
			return runtime.sessionId || composerFace.sessionId || "";
		}
		function fillComposer(props, text) {
			if (!text) return;
			if (props && props.inputActions && typeof props.inputActions.setDraft === "function") {
				props.inputActions.setDraft(text);
				return;
			}
			const ta = document.querySelector("[data-composer-card] textarea, [data-phase] textarea, textarea");
			if (!ta) return;
			const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
			if (desc && desc.set) desc.set.call(ta, text);
			else ta.value = text;
			ta.dispatchEvent(new Event("input", { bubbles: true }));
			ta.dispatchEvent(new Event("change", { bubbles: true }));
		}
		function sessionFace(props) {
			return sessionFaceById(resolveSessionId(props));
		}
		function sessionFaceById(sid) {
			if (runtime.sessions && typeof runtime.sessions.binding === "function" && sid) try {
				const binding = runtime.sessions.binding(sid);
				if (binding && binding.session && typeof binding.session.prompt === "function") return binding.session;
			} catch {}
			return null;
		}
		function observableSessionById(sid) {
			const sessions = runtime.sessions;
			if (!sessions || !sid) return null;
			if (typeof sessions.scope === "function" && typeof sessions.sessionOf === "function") try {
				const scope = sessions.scope(sid);
				const session = scope ? sessions.sessionOf(scope) : null;
				if (session) return session;
			} catch {}
			if (typeof sessions.binding === "function") try {
				const binding = sessions.binding(sid);
				if (binding && binding.session) return binding.session;
			} catch {}
			return null;
		}
		function snapshotOf(sid) {
			const face = observableSessionById(sid) || sessionFaceById(sid);
			if (!face || typeof face.getSnapshot !== "function") return null;
			try {
				return sessionSnapshotWithChat(sid, face);
			} catch {
				return null;
			}
		}
		function pinParentSessionId() {
			const sid = activeSessionId();
			return parentSessionTarget(sid, snapshotOf(sid), readSessionListSnap());
		}
		function flushQueuedToParent(parentId) {
			const face = sessionFaceById(parentId);
			const items = queuedMessages(snapshotOf(parentId));
			if (!face || !items.length) return Promise.resolve(false);
			if (typeof face.updateQueue === "function") return items.reduce((prev, item) => prev.then(() => {
				return Promise.resolve(face.updateQueue(item.id, { kind: "steer" })).then((result) => {
					if (result && result.ok === false) {
						const code = result.error && result.error.code;
						if (code === "steer-unavailable" || code === "queue-item-not-found") return;
						throw new Error(result.error && (result.error.message || result.error.code) || "updateQueue rejected");
					}
				});
			}), Promise.resolve()).then(() => true);
			return dispatchToConversation({}, "【主对话插话】请立刻处理输入框已提交、但还没进入当前轮的指令，不要空等。", parentId);
		}
		function dispatchToConversation(props, text, sessionId) {
			if (!text) return Promise.resolve(false);
			const face = sessionId ? sessionFaceById(sessionId) : sessionFace(props);
			if (face && typeof face.prompt === "function") {
				const mode = snapshotIsRunning(snapshotOf(sessionId || resolveSessionId(props))) ? "steer" : "queue";
				return face.prompt([{
					type: "text",
					text
				}], mode).then((result) => {
					if (result && result.ok === false) throw new Error(result.error && (result.error.message || result.error.code) || "session.prompt rejected");
					return true;
				});
			}
			if (props && props.inputActions && typeof props.inputActions.submit === "function") {
				fillComposer(props, text);
				props.inputActions.submit();
				return Promise.resolve(true);
			}
			return Promise.reject(/* @__PURE__ */ new Error("当前没有可写入的主对话。请先打开或新建一个会话。"));
		}
		const WORKBENCH_TRANSACTION_STATE_KEY = "ap-wb-session-transactions:v1";
		function loadWorkbenchTransactionState() {
			try {
				const value = JSON.parse(localStorage.getItem(WORKBENCH_TRANSACTION_STATE_KEY) || "null");
				return {
					transactions: Array.isArray(value && value.transactions) ? value.transactions : [],
					paused: Array.isArray(value && value.paused) ? value.paused : []
				};
			} catch {
				return {
					transactions: [],
					paused: []
				};
			}
		}
		const restoredWorkbenchState = loadWorkbenchTransactionState();
		const workbenchTransactions = window.__apWorkbenchTransactions || (window.__apWorkbenchTransactions = createSessionTransactionRegistry(Date.now, restoredWorkbenchState.transactions));
		const workbenchPausedSessions = window.__apWorkbenchPausedSessions || (window.__apWorkbenchPausedSessions = new Set(restoredWorkbenchState.paused));
		function persistWorkbenchTransactionState() {
			const transactions = workbenchTransactions.committed();
			const activeIds = new Set(transactions.map((item) => item.sessionId));
			const paused = [...workbenchPausedSessions].filter((sessionId) => activeIds.has(sessionId));
			try {
				if (!transactions.length) localStorage.removeItem(WORKBENCH_TRANSACTION_STATE_KEY);
				else localStorage.setItem(WORKBENCH_TRANSACTION_STATE_KEY, JSON.stringify({
					transactions,
					paused
				}));
			} catch {}
		}
		function setWorkbenchTransactionPaused(sessionId, paused) {
			const id = String(sessionId || "").trim();
			if (!id) return;
			if (paused) workbenchPausedSessions.add(id);
			else workbenchPausedSessions.delete(id);
			persistWorkbenchTransactionState();
		}
		const workbenchSessionBindings = window.__apWorkbenchSessionBindings || (window.__apWorkbenchSessionBindings = /* @__PURE__ */ new Map());
		const workbenchRequirementRecords = window.__apWorkbenchRequirementRecords || (window.__apWorkbenchRequirementRecords = /* @__PURE__ */ new Map());
		const workbenchRequirementPending = window.__apWorkbenchRequirementPending || (window.__apWorkbenchRequirementPending = /* @__PURE__ */ new Set());
		const workbenchRequirementWatchers = window.__apWorkbenchRequirementWatchers || (window.__apWorkbenchRequirementWatchers = /* @__PURE__ */ new Map());
		function workbenchBindingKey(sessionId) {
			return "ap-wb-session-binding:" + String(sessionId || "").trim();
		}
		function rememberWorkbenchBinding(sessionId, payload) {
			const id = String(sessionId || "").trim();
			if (!id || !payload || !payload.cwd || !payload.projectId) return null;
			const binding = {
				sessionId: id,
				cwd: payload.cwd,
				module: payload.module || "tender",
				projectId: payload.projectId
			};
			workbenchSessionBindings.set(id, binding);
			try {
				localStorage.setItem(workbenchBindingKey(id), JSON.stringify(binding));
			} catch {}
			return binding;
		}
		function cachedWorkbenchBinding(sessionId, cwd) {
			const id = String(sessionId || "").trim();
			if (!id) return null;
			let binding = workbenchSessionBindings.get(id) || null;
			if (!binding) try {
				binding = JSON.parse(localStorage.getItem(workbenchBindingKey(id)) || "null");
			} catch {
				binding = null;
			}
			if (!binding || !binding.projectId || cwd && binding.cwd && normPath(binding.cwd) !== normPath(cwd)) return null;
			return rememberWorkbenchBinding(id, binding);
		}
		function resolveWorkbenchBinding(sessionId, cwd) {
			const cached = cachedWorkbenchBinding(sessionId, cwd);
			if (cached) return Promise.resolve(cached);
			if (!sessionId || !cwd) return Promise.resolve(null);
			return api("/api/agent-pi/session-project?sessionId=" + encodeURIComponent(sessionId), cwd, { method: "GET" }).then((body) => body && body.binding ? rememberWorkbenchBinding(sessionId, body.binding) : null).catch(() => null);
		}
		function projectRequirementText(text) {
			const clean = stripMentionArtifacts(String(text || "")).trim();
			if (!clean) return "";
			if (isWorkbenchWakeText(clean)) return "";
			if (/^【(?:Agent Pi\b|用户要求账本|用户验收口径已确认|阶段切换|阶段已收口|执行账本对齐|用户最新要求|恢复未递交成果|成果质检并整理|专业项目启动|主对话插话|主机已自动重启|补齐实际工程量清单|补齐投标分析底稿|补齐组价当地情报|补齐组价强制放行说明)/.test(clean)) return "";
			if (/^(?:继续|开始|暂停|停止|收到|好的?|谢谢|进度(?:如何|怎样|怎么样)?|到哪(?:里|儿)了|现在什么状态)[？?。.!！\s]*$/i.test(clean)) return "";
			return /(?:请|需要|要求|必须|应当|应该|务必|优先|只要|只需|只修改|不要|不得|禁止|改成|改为|修改|调整|修正|纠正|替换|换成|补充|补齐|增加|新增|删除|移除|保留|采用|沿用|使用|重新|重做|改写|重写|更新|完善|优化|排序|合并|拆分|输出|生成|制作|编制|翻译|标注|核对|检查|审查|不对|有误|不符合|不满意|遗漏|缺少|please|must|should|need(?:\s+to)?|require|only|do\s+not|don't|revise|change|update|fix|correct|replace|add|remove|delete|keep|adopt|use\s+.+instead)/i.test(clean) ? clean : "";
		}
		function recordWorkbenchUserRequirement(props, text, retainDedupe) {
			const clean = projectRequirementText(text);
			const sessionId = sessionHint(props) || runtime.sessionId || "";
			const cwd = workspaceCwd(props);
			if (!clean || !sessionId || !cwd) return Promise.resolve(null);
			const recordKey = sessionId + "\n" + clean;
			const existing = workbenchRequirementRecords.get(recordKey);
			if (existing) return existing;
			workbenchRequirementPending.add(recordKey);
			const tracked = resolveWorkbenchBinding(sessionId, cwd).then((binding) => {
				if (!binding) return null;
				return api("/api/agent-pi/stage", cwd, {
					method: "POST",
					body: JSON.stringify({
						action: "record_requirement",
						module: binding.module,
						projectId: binding.projectId,
						sessionId,
						text: clean
					})
				}).then((result) => {
					window.dispatchEvent(new CustomEvent("agent-pi-user-requirement", { detail: result && result.requirement }));
					return result;
				});
			}).catch((error) => {
				showToast("项目要求同步失败：" + String(error && error.message || error));
				return null;
			}).then((result) => {
				if (!result || !retainDedupe) workbenchRequirementRecords.delete(recordKey);
				return result;
			}).finally(() => workbenchRequirementPending.delete(recordKey));
			workbenchRequirementRecords.set(recordKey, tracked);
			return tracked;
		}
		function projectRequirementWritePending(sessionId) {
			const prefix = String(sessionId || "").trim() + "\n";
			if (prefix === "\n") return false;
			for (const key of workbenchRequirementPending) if (key.startsWith(prefix)) return true;
			return false;
		}
		function userRequirementNodeText(node) {
			return (node && node.content || []).filter((part) => part && part.type === "text").map((part) => part.text || "").join("").trim();
		}
		function ensureUserRequirementWatcher(sessionId) {
			const id = String(sessionId || "").trim();
			if (!id || workbenchRequirementWatchers.has(id)) return;
			if (!cachedWorkbenchBinding(id, runtime.cwd || composerFace.cwd || "")) return;
			const session = observableSessionById(id);
			if (!session || typeof session.getSnapshot !== "function" || typeof session.subscribe !== "function") return;
			let initialSnapshot;
			try {
				initialSnapshot = sessionSnapshotWithChat(id, session);
			} catch {
				return;
			}
			let watermark = codexUserNodeWatermark(initialSnapshot);
			const seenSubmissions = /* @__PURE__ */ new Set();
			const seenQueue = /* @__PURE__ */ new Set();
			const submittedTexts = /* @__PURE__ */ new Set();
			const onSession = () => {
				let snapshot;
				try {
					snapshot = sessionSnapshotWithChat(id, session);
				} catch {
					return;
				}
				if (snapshot && snapshot.removed === true) {
					const watcher = workbenchRequirementWatchers.get(id);
					if (watcher && typeof watcher.unsubscribe === "function") try {
						watcher.unsubscribe();
					} catch {}
					workbenchRequirementWatchers.delete(id);
					return;
				}
				for (const submission of snapshot && snapshot.pendingSubmissions || []) {
					const key = String(submission && submission.requestId || "");
					if (!key || seenSubmissions.has(key)) continue;
					seenSubmissions.add(key);
					const text = projectRequirementText(submission.text);
					if (text) {
						submittedTexts.add(text);
						recordWorkbenchUserRequirement({ sessionId: id }, text, true);
					}
				}
				for (const queued of snapshot && snapshot.queue || []) {
					const key = String(queued && (queued.rpcId || queued.messageId || queued.id) || "");
					if (!queued || !queued.rpcId || !key || seenQueue.has(key)) continue;
					seenQueue.add(key);
					const text = projectRequirementText(queued.text);
					if (text) {
						submittedTexts.add(text);
						recordWorkbenchUserRequirement({ sessionId: id }, text, true);
					}
				}
				for (const node of sessionNodes(snapshot)) {
					if (!node || node.kind !== "user" || typeof node.seq !== "number" || node.seq <= watermark) continue;
					watermark = Math.max(watermark, node.seq);
					const text = projectRequirementText(userRequirementNodeText(node));
					if (!text) continue;
					if (submittedTexts.delete(text)) {
						workbenchRequirementRecords.delete(id + "\n" + text);
						continue;
					}
					recordWorkbenchUserRequirement({ sessionId: id }, text, false);
				}
			};
			let unsubscribe;
			try {
				unsubscribe = subscribeSessionWithChat(id, session, onSession);
			} catch {
				return;
			}
			if (typeof unsubscribe !== "function") return;
			workbenchRequirementWatchers.set(id, {
				session,
				unsubscribe
			});
			onSession();
		}
		function prepareWorkbenchTransaction(sessionId, payload) {
			const id = String(sessionId || "").trim();
			if (!id) throw new Error("自动推进需要明确的主会话。");
			const previous = workbenchTransactions.get(id);
			if (previous && (previous.phase === "prepared" || previous.phase === "committed")) {
				if (previous.payload.cwd === payload.cwd && previous.payload.module === payload.module && previous.payload.projectId === payload.projectId) {
					rememberWorkbenchBinding(id, payload);
					ensureUserRequirementWatcher(id);
					return previous;
				}
				throw new Error("当前会话已有另一项自动推进事务，请先暂停或结束。");
			}
			const transaction = workbenchTransactions.prepare(id, payload);
			rememberWorkbenchBinding(id, payload);
			ensureUserRequirementWatcher(id);
			return transaction;
		}
		function commitWorkbenchTransaction(sessionId) {
			const transaction = workbenchTransactions.commit(sessionId);
			workbenchPausedSessions.delete(String(sessionId || "").trim());
			persistWorkbenchTransactionState();
			return transaction;
		}
		function workbenchTransactionCanRun(sessionId) {
			return workbenchTransactions.canRun(sessionId);
		}
		function settleWorkbenchTransaction(sessionId, phase, error) {
			if (!workbenchTransactions.get(sessionId)) return;
			if (phase === "succeeded") workbenchTransactions.succeed(sessionId);
			else workbenchTransactions.fail(sessionId, error);
			workbenchPausedSessions.delete(String(sessionId || "").trim());
			persistWorkbenchTransactionState();
		}
		function destroyWorkbenchTransaction(sessionId) {
			workbenchSessionBindings.delete(String(sessionId || "").trim());
			try {
				localStorage.removeItem(workbenchBindingKey(sessionId));
			} catch {}
			workbenchTransactions.destroy(sessionId);
			workbenchPausedSessions.delete(String(sessionId || "").trim());
			persistWorkbenchTransactionState();
		}
		const monitorEngine = createWorkbenchSessionMonitor({
			api,
			activeSessionId,
			dispatchToConversation,
			flushQueuedToParent,
			pinParentSessionId,
			readSessionListSnap,
			snapshotOf,
			prepareTransaction: prepareWorkbenchTransaction,
			commitTransaction: commitWorkbenchTransaction,
			transactionCanRun: workbenchTransactionCanRun,
			settleTransaction: settleWorkbenchTransaction,
			destroyTransaction: destroyWorkbenchTransaction,
			setTransactionPaused: setWorkbenchTransactionPaused,
			requirementsPending: projectRequirementWritePending,
			onChange: () => window.dispatchEvent(new Event("agent-pi-monitor-changed"))
		});
		function restoreActiveWorkbenchMonitor() {
			if (monitorEngine.state.monitoring) return false;
			const parentSessionId = pinParentSessionId();
			const transaction = workbenchTransactions.get(parentSessionId);
			if (!transaction || transaction.phase !== "committed") return false;
			rememberWorkbenchBinding(parentSessionId, transaction.payload);
			ensureUserRequirementWatcher(parentSessionId);
			return monitorEngine.restore(transaction.payload, parentSessionId, workbenchPausedSessions.has(parentSessionId));
		}
		let transactionRestoreList = null;
		function watchWorkbenchTransactionRestore() {
			const list = runtime.sessions && runtime.sessions.list;
			if (list && list !== transactionRestoreList && typeof list.subscribe === "function") {
				transactionRestoreList = list;
				list.subscribe(() => {
					restoreActiveWorkbenchMonitor();
				});
			}
			restoreActiveWorkbenchMonitor();
		}
		function slugify(str) {
			return String(str || "").toLowerCase().trim().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 128);
		}
		function formatClock(iso) {
			if (!iso) return "—";
			const value = Date.parse(iso);
			if (!Number.isFinite(value)) return "—";
			return new Date(value).toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit"
			});
		}
		function fileName(path) {
			const parts = String(path || "").split(/[\\/]/);
			return parts[parts.length - 1] || path;
		}
		function sameFilePath(left, right) {
			return String(left || "").replace(/\\/g, "/").toLowerCase() === String(right || "").replace(/\\/g, "/").toLowerCase();
		}
		function findSetupRestore(restores, sourcePath) {
			const list = Array.isArray(restores) ? restores : [];
			const name = fileName(sourcePath);
			return list.find((item) => item && (sameFilePath(item.sourcePath, sourcePath) || item.originalName === name)) || null;
		}
		function restoreOpenPath(sourcePath, restores) {
			const hit = findSetupRestore(restores, sourcePath);
			return hit && hit.manuscriptPath || sourcePath;
		}
		function desktopApi() {
			if (typeof window === "undefined") return null;
			const frames = [window];
			try {
				if (window.parent && window.parent !== window) frames.push(window.parent);
			} catch {}
			try {
				if (window.top && window.top !== window && window.top !== window.parent) frames.push(window.top);
			} catch {}
			for (let i = 0; i < frames.length; i++) try {
				const api = frames[i] && frames[i].agentPiDesktop;
				if (api) return api;
			} catch {}
			return null;
		}
		function normalizePickedPaths(value) {
			if (value == null) return [];
			if (typeof value === "string") {
				const path = value.trim();
				return path ? [path] : [];
			}
			if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
			if (typeof value === "object" && Array.isArray(value.filePaths)) return normalizePickedPaths(value.filePaths);
			if (typeof value === "object" && typeof value.length === "number") return Array.from(value).map((item) => String(item || "").trim()).filter(Boolean);
			return [];
		}
		function mergeKbEntries(server, local) {
			const serverList = Array.isArray(server) ? server.slice() : [];
			const localList = Array.isArray(local) ? local : [];
			const serverSlugs = new Set(serverList.map((entry) => entry && entry.slug).filter(Boolean));
			const serverNames = new Set(serverList.map((entry) => String(entry && (entry.name || entry.originalName) || "")).filter(Boolean));
			return localList.filter((entry) => {
				if (!entry || !entry.slug || serverSlugs.has(entry.slug)) return false;
				if (String(entry.slug).indexOf("local:") === 0) {
					const name = String(entry.name || entry.originalName || entry.slug.slice(6));
					if (name && serverNames.has(name)) return false;
				}
				return true;
			}).concat(serverList);
		}
		function kbLandingCardVisible(label, entries) {
			const shown = String(label || "").trim();
			if (!shown) return false;
			return !(Array.isArray(entries) ? entries : []).some((entry) => {
				const name = String(entry && (entry.name || entry.originalName) || "");
				if (!name || shown.indexOf(name) < 0) return false;
				const status = entry && entry.parseStatus;
				return status === "ready" || status === "staged" || status === "parsing" || status === "failed";
			});
		}
		function kbFidelityLabel(entry, lang) {
			const en = localeIdOf(lang || langState.lang) !== "zh";
			const clauseCount = Number(entry && entry.clauseCount);
			const coverage = Number(entry && entry.coverage);
			const tableCount = Number(entry && entry.tableCount);
			if (Number.isFinite(clauseCount) && clauseCount > 0 && Number.isFinite(coverage)) {
				const tables = Number.isFinite(tableCount) && tableCount > 0 ? en ? " · tables " + tableCount : " · 表 " + tableCount : "";
				return en ? "Clauses " + clauseCount + tables + " · coverage " + Math.round(coverage * 100) + "%" : "条款 " + clauseCount + tables + " · 覆盖 " + Math.round(coverage * 100) + "%";
			}
			const chunkCount = Number(entry && entry.chunkCount);
			if (Number.isFinite(chunkCount) && chunkCount > 0) return en ? chunkCount + " chunks" : chunkCount + " 块";
			return "";
		}
		function kbIngestKind(entry) {
			if (!entry) return "";
			if (entry.ingest === "pack") return "pack";
			if (entry.ingest === "mineru") return "mineru";
			const name = String(entry.originalName || entry.name || "");
			if (/\.(pdf|docx?|pptx?|xlsx?|xls|png|jpe?g|jp2|webp|gif|bmp)$/i.test(name)) return "local";
			return "raw";
		}
		function kbIngestLabel(entry, lang) {
			const kind = kbIngestKind(entry);
			if (!kind) return "";
			const en = localeIdOf(lang || langState.lang) !== "zh";
			if (kind === "pack") return en ? "Knowledge pack" : "知识包";
			if (kind === "mineru") return en ? "MinerU manuscript" : "MinerU 解析稿";
			if (kind === "local") return en ? "Local text layer" : "本机文本层";
			return en ? "Source ingest" : "原文入库";
		}
		function kbCategoryLabel(category, lang) {
			const name = String(category || "");
			const key = "kb.cat." + name;
			const labeled = tAp(key);
			return labeled === key ? name : labeled;
		}
		function apJoin(items) {
			return (items || []).join(langState.lang === "zh" ? "、" : ", ");
		}
		function kbProgressText(text) {
			const raw = String(text || "");
			if (raw === "正在落入原始文档区…" || raw === "Saving to the staging area…") return tAp("kb.landingProgress");
			if (raw === "已落入原始文档区，等待解析入库" || raw === "In the staging area, waiting to be parsed") return tAp("kb.stagedWait");
			if (raw === "已保存" || raw === "Saved") return tAp("kb.mineruSavedHint");
			return raw;
		}
		function looksLikeKbPackName(file) {
			const name = String(file && file.name || "");
			const base = name.replace(/^.*[\\/]/, "").toLowerCase();
			if (base === "pack.json" || base === "manuscript.md") return true;
			if ((file && file.type) === "directory" && /(kb-pack|knowledge-pack|知识包)/i.test(name)) return true;
			return false;
		}
		function kbChatImportCopy() {
			return {
				title: tAp("kb.path2Title"),
				warn: tAp("kb.path2Warn"),
				say: "把这个 PDF 准确整理完整内容，做成知识包再入库。",
				after: tAp("kb.path2After")
			};
		}
		const MODULE_CREATE_PROMPTS = {
			distill: "请先读 skill workbench-domain-builder。当前会话使用 DSH 原生「创造模式」作为创作驾驶舱，但本任务的交付物是专业工作台业务模块，不是 Agent 预设。不得修改 DSH 官方预设、不得写 agent.cordis.yml 或改插件组装，除非用户另行明确要求创建 Agent 预设。生成的必须是完整工作台模块包：顶栏中文名、阶段监控条、开工资料登记、后续阶段的流程门槛（总报告 / 按册任务 / 风险审查 / 必要的人工确认）、配套方法 skill、能挂的知识库。来源是投标项目时，必须从内置 tender 复制并保留原阶段 id 和 controlProfile=tender，不得只仿造七段外观而丢掉 BOQ、证据、能力包和最终冻结硬门。用 workbench_module_save / workbench_module_copy / workbench_skill_save 直接装上，本应用按现有盘面画出来。不要发明新窗口或新界面。不要让我粘贴 JSON、id、slug。不要改内置投标。我想把来源项目里已经做完且由用户明确认可的成果与修订经验，整理成以后同类工作的标准。读取来源项目的 Official Outputs、用户要求台账和明确审批记录；不能把“文件存在”当成“用户认可”。如来源模块是 tender，先 workbench_module_copy 复制内置投标，保留原阶段 id、三个人工门、风险审查和 controlProfile=tender，再把用户验收的方法、skill 和知识包挂上去。范文或用户模板进知识库，做法和用户纠正规则记成 skill，模块保存后用中文告诉我顶栏新标签叫什么、下次怎么开项目。最多确认一句中文名称和分几步。",
			"copy-pack": "请先读 skill workbench-domain-builder。当前会话使用 DSH 原生「创造模式」作为创作驾驶舱，但本任务的交付物是专业工作台业务模块，不是 Agent 预设。不得修改 DSH 官方预设、不得写 agent.cordis.yml 或改插件组装，除非用户另行明确要求创建 Agent 预设。生成的必须是完整工作台模块包：顶栏中文名、阶段监控条、开工资料登记、后续阶段的流程门槛（总报告 / 按册任务 / 风险审查 / 必要的人工确认）、配套方法 skill、能挂的知识库。来源是投标项目时，必须从内置 tender 复制并保留原阶段 id 和 controlProfile=tender，不得只仿造七段外观而丢掉 BOQ、证据、能力包和最终冻结硬门。用 workbench_module_save / workbench_module_copy / workbench_skill_save 直接装上，本应用按现有盘面画出来。不要发明新窗口或新界面。不要让我粘贴 JSON、id、slug。不要改内置投标。我们的步骤和「投标全流程」一样，但要用自己的规范、组价表或投标函。请用 workbench_module_copy 拷贝当前内置投标，完整保留其阶段 id、风险审查和人工确认门禁。拷完用中文问我模块叫什么、规范或范文在哪（可以让我上传），挂到规范包。建好告诉我顶栏新标签和下次怎么用。",
			"custom-steps": "请先读 skill workbench-domain-builder。当前会话使用 DSH 原生「创造模式」作为创作驾驶舱，但本任务的交付物是专业工作台业务模块，不是 Agent 预设。不得修改 DSH 官方预设、不得写 agent.cordis.yml 或改插件组装，除非用户另行明确要求创建 Agent 预设。生成的必须是完整工作台模块包：顶栏中文名、阶段监控条、开工资料登记、后续阶段的流程门槛（总报告 / 按册任务 / 风险审查 / 必要的人工确认）、配套方法 skill、能挂的知识库。来源是投标项目时，必须从内置 tender 复制并保留原阶段 id 和 controlProfile=tender，不得只仿造七段外观而丢掉 BOQ、证据、能力包和最终冻结硬门。用 workbench_module_save / workbench_module_copy / workbench_skill_save 直接装上，本应用按现有盘面画出来。不要发明新窗口或新界面。不要让我粘贴 JSON、id、slug。不要改内置投标。我们这类工作和「投标全流程」步骤不一样。请用一条消息、用大白话问清：这个领域叫什么、实际工作分哪几步（3到6步）、开工有什么资料、最后交什么、有没有规范或范文。问完后建成完整模块包。保存后告诉我顶栏新标签叫什么、下次怎么开项目。"
		};
		function remoteResultValue(result, operation) {
			if (result && result.ok === true) return result.value;
			const error = result && result.error;
			const message = error && (error.message || error.code);
			throw new Error((operation || "DSH 远程调用") + "失败：" + (message || "未返回可用结果"));
		}
		function waitForSessionFace(sessionId, attempts) {
			const face = sessionFaceById(sessionId);
			if (face) return Promise.resolve(face);
			if ((attempts || 0) >= 30) return Promise.reject(/* @__PURE__ */ new Error("创造模式会话已建立，但对话绑定尚未就绪。"));
			return new Promise((resolve) => window.setTimeout(resolve, 100)).then(() => waitForSessionFace(sessionId, (attempts || 0) + 1));
		}
		function moduleSourceSuffix(context) {
			const source = context || {};
			const lines = [
				"",
				"【Agent Pi 来源上下文】",
				"来源会话：" + (source.sessionId || "未绑定"),
				"工作区：" + (source.cwd || "未绑定")
			];
			if (source.module) lines.push("来源模块：" + source.module);
			if (source.projectId) lines.push("来源项目：" + source.projectId);
			if (source.projectRoot) lines.push("项目根目录：" + source.projectRoot);
			lines.push("若来源会话有历史，不要假设新会话能直接继承聊天文本；以项目中已接受的 Official Outputs、.agent-pi 用户要求台账和显式人工审批为准。");
			return lines.join("\n");
		}
		async function openNativeModuleCreate(props, prompt, context) {
			const sourceId = resolveSessionId(props) || activeSessionId();
			const list = readSessionListSnap();
			const summary = sourceId && list && list.byId ? list.byId[sourceId] : null;
			const blank = !!(summary && summary.blank === true) || !!(props && props.session && props.session.blank === true);
			const remote = runtime.remote;
			if (!sourceId) throw new Error("请先打开或新建一个主对话，再进入创造模式。");
			if (!remote || !remote.agentPresets || typeof remote.agentPresets.select !== "function" || !remote.session || typeof remote.session.create !== "function") throw new Error("当前 DSH Typert Gateway 未提供创造模式所需的 agentPresets/session 接口。");
			if (!runtime.uiWorkspace || typeof runtime.uiWorkspace.openSession !== "function" || typeof runtime.sessions?.refresh !== "function") throw new Error("当前 DSH 会话服务尚未就绪。");
			let targetId = sourceId;
			if (blank) {
				remoteResultValue(await remote.agentPresets.select(sourceId, "cordis"), "切换原生创造模式");
				await runtime.sessions.refresh();
			} else {
				const created = remoteResultValue(await remote.session.create({
					cwd: context && context.cwd || workspaceCwd(props),
					agentPreset: "cordis"
				}), "新建原生创造模式会话");
				targetId = created && created.sessionId;
				if (!targetId) throw new Error("DSH 未返回创造模式会话 id。");
				await runtime.sessions.refresh();
				runtime.uiWorkspace.openSession(targetId);
			}
			await waitForSessionFace(targetId, 0);
			await dispatchToConversation({}, prompt + moduleSourceSuffix(Object.assign({}, context, { sessionId: sourceId })), targetId);
			return targetId;
		}
		function moduleCreateCopy() {
			return {
				title: tAp("mm.createTitle"),
				lead: tAp("mm.createLead"),
				warn: tAp("mm.createWarn"),
				advanced: tAp("mm.createAdvanced"),
				cards: [
					{
						id: "distill",
						title: tAp("mm.card.distill"),
						body: tAp("mm.card.distillBody")
					},
					{
						id: "copy-pack",
						title: tAp("mm.card.copy"),
						body: tAp("mm.card.copyBody")
					},
					{
						id: "custom-steps",
						title: tAp("mm.card.custom"),
						body: tAp("mm.card.customBody")
					}
				]
			};
		}
		function looksLikeUserTemplateName(name) {
			const base = String(name || "").replace(/^.*[\\/]/, "");
			if (!base) return false;
			const stem = base.replace(/\.[^.]+$/, "");
			if (/(用户模板|用户模版)/.test(stem)) return true;
			if (/(模板|模版)$/.test(stem)) return true;
			if (/(^|[^a-z0-9])template([^a-z0-9]|$)/i.test(stem)) return true;
			return false;
		}
		function kbCategoryHint(category) {
			if (category === "用户模板" || category === "用户模版") return tAp("kb.hint.用户模板");
			return "";
		}
		const KB_PRESET_CATEGORIES = [
			"规范",
			"合同",
			"范文",
			"方法标准",
			"用户模板"
		];
		function sortKbCategories(names) {
			return names.slice().sort((a, b) => {
				const ia = KB_PRESET_CATEGORIES.indexOf(a);
				const ib = KB_PRESET_CATEGORIES.indexOf(b);
				if (ia >= 0 && ib >= 0) return ia - ib;
				if (ia >= 0) return -1;
				if (ib >= 0) return 1;
				return String(a).localeCompare(String(b), "zh");
			});
		}
		function groupKbEntries(entries, folders, category) {
			const list = (Array.isArray(entries) ? entries : []).filter((entry) => !category || entry.category === category);
			const inCat = (Array.isArray(folders) ? folders : []).filter((folder) => folder && folder.category === category).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "zh"));
			const buckets = new Map(inCat.map((folder) => [folder.id, []]));
			const loose = [];
			for (const entry of list) {
				const bucket = entry.folderId ? buckets.get(entry.folderId) : void 0;
				if (bucket) bucket.push(entry);
				else loose.push(entry);
			}
			return {
				folders: inCat.map((folder) => ({
					folder,
					entries: buckets.get(folder.id) || []
				})),
				loose
			};
		}
		function diskPathOf(file) {
			const desktop = desktopApi();
			if (desktop && typeof desktop.pathForFile === "function") try {
				const path = String(desktop.pathForFile(file) || "").trim();
				if (isAbsolutePath(path)) return path;
			} catch {}
			const fallback = String(file && file.path || "").trim();
			return isAbsolutePath(fallback) ? fallback : "";
		}
		function joinPath(base, child) {
			const sep = String(base).indexOf("\\") >= 0 || /^[a-zA-Z]:/.test(String(base)) ? "\\" : "/";
			return String(base).replace(/[\\/]+$/, "") + sep + String(child).replace(/^[\\/]+/, "");
		}
		function isAbsolutePath(value) {
			const path = String(value || "");
			return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\") || path.startsWith("/");
		}
		function explorerTarget(cwd, targetPath, file) {
			let path = String(targetPath || file && file.path || "").trim();
			const rel = file && file.relativePath ? String(file.relativePath).trim() : "";
			if (!path && rel && cwd) path = joinPath(cwd, rel);
			if (path && !isAbsolutePath(path) && cwd) path = joinPath(cwd, path);
			if (!path) path = String(cwd || "").trim();
			return path.replace(/\//g, "\\");
		}
		function parentDir(path) {
			const value = String(path || "").replace(/[\\/]+$/, "");
			const idx = Math.max(value.lastIndexOf("\\"), value.lastIndexOf("/"));
			if (idx <= 0) return value;
			if (idx === 2 && /^[a-zA-Z]:/.test(value)) return value;
			return value.slice(0, idx);
		}
		function openInExplorer(cwd, targetPath, options) {
			const file = options && options.file;
			const root = String(cwd || "").trim();
			const target = explorerTarget(root, targetPath, file);
			if (!target) return Promise.reject(new Error(tAp("files.noCwd")));
			const isDir = file ? file.type === "directory" : true;
			const reveal = options && Object.prototype.hasOwnProperty.call(options, "reveal") ? Boolean(options.reveal) : !isDir;
			showToast(tAp("files.opening"));
			const desktop = desktopApi();
			const viaDesktop = () => {
				if (!desktop) return Promise.resolve(false);
				const invoke = reveal && typeof desktop.revealPath === "function" ? desktop.revealPath(target) : typeof desktop.openPath === "function" ? desktop.openPath(reveal ? parentDir(target) || target : target) : null;
				if (!invoke) return Promise.resolve(false);
				return Promise.resolve(invoke).then((msg) => !msg).catch(() => false);
			};
			return viaDesktop().then((ok) => {
				if (ok) return {
					ok: true,
					path: target
				};
				return api("/api/agent-pi/files/open", root || target, {
					method: "POST",
					body: JSON.stringify({
						path: target,
						reveal
					})
				});
			});
		}
		function stageSlice(row, stageId) {
			if (!row) return null;
			if (row.stages && row.stages[stageId]) return row.stages[stageId];
			if (row.stage && row.stage.stageId === stageId) return row.stage;
			return null;
		}
		function officialFolder(stageId) {
			return {
				"bid-risk-decision": "bid-decision",
				"tender-document-analysis": "document-analysis",
				"pricing-basis-freeze": "pricing-basis",
				"boq-five-step-pricing": "boq-pricing",
				"planning-and-submission": "planning",
				"submission-compliance-freeze": "submission",
				"project-setup": "setup",
				"delivery-setup": "delivery",
				"delivery-controls": "delivery",
				"investment-setup": "investment",
				"investment-diligence": "investment"
			}[stageId] || stageId;
		}
		function officialStagePath(cwd, projectId, stageId) {
			return joinPath(joinPath(joinPath(cwd, "Agent Pi Outputs"), projectId), officialFolder(stageId));
		}
		function stageRowDirty(slice, tasks, checkRow) {
			if (checkRow && typeof checkRow.needsQc === "boolean") return checkRow.needsQc;
			const done = tasks.filter((task) => task.status === "done").length;
			if (tasks.filter((task) => task.status === "error").length > 0) return true;
			if (slice && slice.status === "done" && tasks.length > 0 && done < tasks.length) return true;
			return false;
		}
		function taskStatusLabel(status) {
			return {
				queued: workbenchText("待处理"),
				running: workbenchText("进行中"),
				done: workbenchText("已完成"),
				error: workbenchText("失败")
			}[status] || status;
		}
		function readWorkbenchOpen() {
			try {
				return sessionStorage.getItem("ap-wb-open") === "1";
			} catch {
				return false;
			}
		}
		function setWorkbenchOpen(open) {
			try {
				sessionStorage.setItem("ap-wb-open", open ? "1" : "0");
			} catch {}
			document.documentElement.classList.toggle("ap-wb-open", !!open);
			window.dispatchEvent(new Event("agent-pi-wb-changed"));
		}
		function focusMainConversation(props) {
			setWorkbenchOpen(false);
			if (props && typeof props.openView === "function") props.openView("chat", "agent-pi-workbench-handoff");
			window.requestAnimationFrame(() => {
				const textarea = document.querySelector("[data-composer-card] textarea, [data-phase] textarea");
				if (!textarea) return;
				try {
					textarea.scrollIntoView({ block: "nearest" });
				} catch {}
				try {
					textarea.focus();
				} catch {}
			});
		}
		function useWorkbenchOpen() {
			const [open, setOpen] = react.useState(() => typeof document !== "undefined" && document.documentElement.classList.contains("ap-wb-open") || readWorkbenchOpen());
			react.useEffect(() => {
				const sync = () => setOpen(document.documentElement.classList.contains("ap-wb-open") || readWorkbenchOpen());
				sync();
				window.addEventListener("agent-pi-wb-changed", sync);
				return () => window.removeEventListener("agent-pi-wb-changed", sync);
			}, []);
			return open;
		}
		function useSidebarInset() {
			const [left, setLeft] = react.useState(260);
			react.useEffect(() => {
				const overlay = document.querySelector("[data-shell-overlay]");
				const side = overlay && overlay.parentElement ? overlay.parentElement.firstElementChild : null;
				if (!side) return void 0;
				const apply = () => setLeft(Math.round(side.getBoundingClientRect().width));
				apply();
				const ro = new ResizeObserver(apply);
				ro.observe(side);
				return () => ro.disconnect();
			}, []);
			return left;
		}
		function stitchMarkdown(edited, original) {
			const sliced = slicePreviewMarkdown(original);
			const restored = restoreCappedTables(edited, sliced.text);
			if (!sliced.truncated) return restored;
			return restored.replace(/\s*$/, "") + original.slice(sliced.text.length);
		}
		function escapeHtml(value) {
			return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
		}
		function citationChipLabel(token) {
			const raw = String(token || "");
			if (raw.startsWith("kb:")) {
				const rest = raw.slice(3);
				const sep = rest.lastIndexOf(":");
				return sep > 0 ? rest.slice(0, sep) : rest;
			}
			if (raw.startsWith("src:")) {
				const rest = raw.slice(4);
				const hash = rest.lastIndexOf("#");
				const path = hash > 0 ? rest.slice(0, hash) : rest;
				const loc = hash > 0 ? rest.slice(hash + 1) : "";
				const name = path.replace(/^.*[/\\]/, "");
				return loc ? name + " · " + loc : name;
			}
			return raw.length > 42 ? raw.slice(0, 39) + "…" : raw;
		}
		function citationChip(token) {
			return "<span class=\"ap-cite\" data-cite=\"" + token + "\" data-cite-token=\"[" + token + "]\" title=\"点击查看出处\">" + citationChipLabel(token) + "</span>";
		}
		function inlineMarkdown(value, ctx) {
			const raw = String(value);
			if (!MARKUP_RE.test(raw)) return HTML_SPECIAL_RE.test(raw) ? escapeHtml(raw) : raw;
			let text = escapeHtml(raw);
			text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
			text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
			text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
			text = text.replace(/\[(kb:[a-z0-9][a-z0-9._-]*:[A-Za-z0-9._-]+)\]/g, (_, token) => citationChip(token));
			text = text.replace(/\[(src:[^\]\r\n]+?)\]/g, (_, token) => citationChip(token));
			text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, href) => {
				const image = resolvePreviewImage(href, ctx);
				return "<img alt=\"" + escapeHtml(alt) + "\" src=\"" + escapeHtml(image.src) + "\" data-md-src=\"" + escapeHtml(image.origin) + "\">";
			});
			text = text.replace(/\[([^\]]+)\]\((https?:[^)]+|data:[^)]+)\)/g, "<a href=\"$2\" target=\"_blank\" rel=\"noreferrer\">$1</a>");
			return text;
		}
		function resolvePreviewImage(href, ctx) {
			const origin = String(href || "").trim().replace(/^</, "").replace(/>.*$/, "").split(/\s+["']/)[0];
			if (!origin || /^(https?:|data:|blob:|#|mailto:)/i.test(origin)) return {
				src: origin,
				origin
			};
			if (!ctx || !ctx.cwd || !ctx.filePath) return {
				src: origin,
				origin
			};
			const filePath = String(ctx.filePath).replace(/\\/g, "/");
			const dir = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : "";
			const rel = origin.replace(/\\/g, "/");
			let resolved;
			if (/^[a-zA-Z]:\//.test(rel) || rel.startsWith("/")) resolved = rel;
			else {
				const parts = (dir + "/" + rel).split("/");
				const out = [];
				for (const part of parts) {
					if (part === "." || part === "") continue;
					if (part === "..") out.pop();
					else out.push(part);
				}
				resolved = out.join("/");
			}
			return {
				src: rawFileUrl(ctx.cwd, resolved.replace(/\//g, "\\")),
				origin
			};
		}
		function isPipeTableRow(line) {
			return /^\s*\|.+\|\s*$/.test(line);
		}
		function isPipeSeparatorRow(line) {
			const trimmed = String(line).trim();
			if (!trimmed.includes("|") || !trimmed.includes("-")) return false;
			const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|");
			return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell.trim()));
		}
		function pipeCells(line) {
			return line.split("|").slice(1, -1).map((cell) => cell.trim());
		}
		function startsMdBlock(line) {
			return /^(#{1,6}\s|```|\s*\\?[-*+]\s|\s*\\?\d+\.\s|\s*>|---+$)/.test(line) || isPipeTableRow(line) || /^\s*<table\b/i.test(line);
		}
		var TABLE_TAGS = {
			table: 1,
			thead: 1,
			tbody: 1,
			tfoot: 1,
			tr: 1,
			th: 1,
			td: 1,
			caption: 1,
			colgroup: 1,
			col: 1,
			br: 1
		};
		function capHtmlTableRows(table, cap) {
			if (!Number.isFinite(cap) || cap === Infinity) return {
				html: table,
				hidden: 0
			};
			let seen = 0;
			let hidden = 0;
			return {
				html: table.replace(/<tr\b[\s\S]*?<\/tr>/gi, (row) => {
					seen += 1;
					if (seen <= cap + 1) return row;
					hidden += 1;
					return "";
				}),
				hidden
			};
		}
		function sanitizeMineruTable(html, cap) {
			const match = /<table\b[\s\S]*?<\/table>/i.exec(html);
			if (!match) return "<p>" + escapeHtml(html) + "</p>";
			const capped = capHtmlTableRows(match[0].replace(/<\/?(script|style|iframe|object|embed|link|meta|img|svg|video|audio)[^>]*>/gi, "").replace(/<\/?([a-z][\w:-]*)\b([^>]*)>/gi, (all, name, attrs) => {
				const tag = String(name).toLowerCase();
				if (tag === "br") return "<br>";
				if (!TABLE_TAGS[tag]) return "";
				if (all.startsWith("</")) return "</" + tag + ">";
				const kept = [];
				const attrRe = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/g;
				let attr;
				while (attr = attrRe.exec(attrs)) if (/^(colspan|rowspan|scope)$/i.test(attr[1])) {
					const value = attr[3] != null ? attr[3] : attr[4] != null ? attr[4] : attr[5] || "";
					kept.push(attr[1].toLowerCase() + "=\"" + escapeHtml(value) + "\"");
				}
				return "<" + tag + (kept.length ? " " + kept.join(" ") : "") + ">";
			}), cap == null ? 80 : cap);
			const more = capped.hidden > 0 ? "<p class=\"ap-doc-more\">还有 " + capped.hidden + " 行未显示，切源码可看全文；保存时会拼回。</p>" : "";
			return "<div class=\"ap-doc-table-wrap\">" + capped.html + "</div>" + more;
		}
		function takeHtmlTable(lines, start) {
			const first = lines[start];
			if (!first || !/^\s*<table\b/i.test(first) && !(/^\s*<html\b/i.test(first) && /<table/i.test(first))) return null;
			const buf = [first];
			let i = start + 1;
			if (!/<\/table>/i.test(first)) {
				while (i < lines.length && !/<\/table>/i.test(lines[i])) {
					buf.push(lines[i]);
					i += 1;
				}
				if (i < lines.length) {
					buf.push(lines[i]);
					i += 1;
				} else return null;
			}
			return {
				html: buf.join("\n"),
				next: i
			};
		}
		function tableRowCapOf(ctx) {
			const cap = ctx && ctx.tableRowCap;
			if (cap === Infinity) return Infinity;
			if (typeof cap === "number" && cap > 0) return cap;
			return 80;
		}
		function collectMdTableRows(markdown) {
			const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
			const tables = [];
			const sep = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;
			let i = 0;
			while (i < lines.length) {
				if (/^\s*\|.+\|\s*$/.test(lines[i]) && i + 1 < lines.length && sep.test(lines[i + 1])) {
					i += 2;
					const rows = [];
					while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
						rows.push(lines[i]);
						i += 1;
					}
					tables.push(rows);
					continue;
				}
				i += 1;
			}
			return tables;
		}
		function mdTableRowHtml(line, ctx) {
			return "<tr>" + line.split("|").slice(1, -1).map((cell) => "<td>" + inlineMarkdown(cell.trim(), ctx) + "</td>").join("") + "</tr>";
		}
		function fillMdTables(root, markdown, ctx, options) {
			const opts = options || {};
			let cancelled = false;
			const batch = opts.batch > 0 ? opts.batch : 80;
			const only = typeof opts.tableIndex === "number" ? opts.tableIndex : -1;
			const tables = collectMdTableRows(markdown);
			const run = async () => {
				if (!root || !root.querySelectorAll) return;
				const wraps = root.querySelectorAll(".ap-doc-table-wrap");
				for (let i = 0; i < wraps.length && i < tables.length; i++) {
					if (only >= 0 && i !== only) continue;
					const wrap = wraps[i];
					const tbody = wrap.querySelector("tbody");
					if (!tbody) continue;
					const rows = tables[i];
					while (!cancelled && tbody.rows.length < rows.length) {
						const start = tbody.rows.length;
						const end = Math.min(rows.length, start + batch);
						tbody.insertAdjacentHTML("beforeend", rows.slice(start, end).map((line) => mdTableRowHtml(line, ctx)).join(""));
						const more = wrap.nextElementSibling;
						if (more && more.classList && more.classList.contains("ap-doc-more")) {
							const left = rows.length - tbody.rows.length;
							if (left <= 0) more.remove();
							else {
								const btn = more.querySelector("[data-md-expand]");
								if (btn) btn.textContent = "还有 " + left + " 行未显示，点击立即展开";
							}
						}
						await new Promise((resolve) => requestAnimationFrame(resolve));
					}
					if (cancelled) return;
				}
			};
			return {
				cancel: () => {
					cancelled = true;
				},
				done: run()
			};
		}
		function mdToHtml(markdown, ctx) {
			const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
			const out = [];
			const cap = tableRowCapOf(ctx);
			let i = 0;
			let tableIndex = 0;
			let listType = null;
			let listItems = [];
			const flushList = () => {
				if (!listType) return;
				out.push("<" + listType + ">" + listItems.map((item) => "<li>" + item + "</li>").join("") + "</" + listType + ">");
				listType = null;
				listItems = [];
			};
			while (i < lines.length) {
				const line = lines[i];
				if (line.startsWith("```")) {
					flushList();
					const code = [];
					i += 1;
					while (i < lines.length && !lines[i].startsWith("```")) {
						code.push(lines[i]);
						i += 1;
					}
					if (i < lines.length) i += 1;
					out.push("<pre><code>" + escapeHtml(code.join("\n")) + "</code></pre>");
					continue;
				}
				const htmlTable = takeHtmlTable(lines, i);
				if (htmlTable) {
					flushList();
					out.push(sanitizeMineruTable(htmlTable.html, cap));
					i = htmlTable.next;
					continue;
				}
				if (isPipeTableRow(line) && i + 1 < lines.length && isPipeSeparatorRow(lines[i + 1])) {
					flushList();
					const header = pipeCells(line).map((cell) => "<th>" + inlineMarkdown(cell, ctx) + "</th>").join("");
					i += 2;
					const rows = [];
					let hidden = 0;
					while (i < lines.length && isPipeTableRow(lines[i])) {
						if (rows.length >= cap) {
							hidden += 1;
							i += 1;
							continue;
						}
						rows.push("<tr>" + pipeCells(lines[i]).map((cell) => "<td>" + inlineMarkdown(cell, ctx) + "</td>").join("") + "</tr>");
						i += 1;
					}
					out.push("<div class=\"ap-doc-table-wrap\" data-md-table=\"" + tableIndex + "\"><table><thead><tr>" + header + "</tr></thead><tbody>" + rows.join("") + "</tbody></table></div>");
					tableIndex += 1;
					if (hidden > 0) out.push("<p class=\"ap-doc-more\"><button type=\"button\" class=\"ap-doc-btn\" data-md-expand=\"table\">还有 " + hidden + " 行未显示，点击立即展开</button></p>");
					continue;
				}
				if (isPipeTableRow(line)) {
					flushList();
					out.push("<div class=\"ap-doc-table-wrap\"><table><tbody><tr>" + pipeCells(line).map((cell) => "<td>" + inlineMarkdown(cell, ctx) + "</td>").join("") + "</tr></tbody></table></div>");
					i += 1;
					continue;
				}
				const heading = /^(#{1,6})\s+(.*)$/.exec(line);
				if (heading) {
					flushList();
					const level = heading[1].length;
					out.push("<h" + level + ">" + inlineMarkdown(heading[2], ctx) + "</h" + level + ">");
					i += 1;
					continue;
				}
				if (/^---+$/.test(line.trim())) {
					flushList();
					out.push("<hr/>");
					i += 1;
					continue;
				}
				const ul = /^\s*\\?[-*+]\s+(.*)$/.exec(line);
				if (ul) {
					if (listType && listType !== "ul") flushList();
					listType = "ul";
					listItems.push(inlineMarkdown(ul[1], ctx));
					i += 1;
					continue;
				}
				const ol = /^\s*\\?\d+\.\s+(.*)$/.exec(line);
				if (ol) {
					if (listType && listType !== "ol") flushList();
					listType = "ol";
					listItems.push(inlineMarkdown(ol[1], ctx));
					i += 1;
					continue;
				}
				if (/^\s*>\s?/.test(line)) {
					flushList();
					const quote = [];
					while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
						quote.push(lines[i].replace(/^\s*>\s?/, ""));
						i += 1;
					}
					out.push("<blockquote><p>" + inlineMarkdown(quote.join(" "), ctx) + "</p></blockquote>");
					continue;
				}
				if (!line.trim()) {
					flushList();
					i += 1;
					continue;
				}
				flushList();
				const para = [];
				while (i < lines.length && lines[i].trim() && !startsMdBlock(lines[i])) {
					para.push(lines[i]);
					i += 1;
				}
				if (!para.length) {
					out.push("<p>" + inlineMarkdown(line, ctx) + "</p>");
					i += 1;
					continue;
				}
				const joined = para.join(" ").trim();
				const embedded = /<table\b[\s\S]*?<\/table>/i.exec(joined);
				if (embedded) {
					const before = joined.slice(0, embedded.index).trim();
					if (before) out.push("<p>" + inlineMarkdown(before, ctx) + "</p>");
					out.push(sanitizeMineruTable(embedded[0], cap));
					const after = joined.slice(embedded.index + embedded[0].length).trim();
					if (after) out.push("<p>" + inlineMarkdown(after, ctx) + "</p>");
					continue;
				}
				out.push("<p>" + inlineMarkdown(joined, ctx) + "</p>");
			}
			flushList();
			return out.join("\n");
		}
		function htmlToMarkdown(root) {
			const blocks = [];
			const inline = (node) => {
				if (!node) return "";
				if (node.nodeType === 3) return String(node.nodeValue || "").replace(/\u00a0/g, " ");
				if (node.nodeType !== 1) return "";
				const tag = node.tagName.toLowerCase();
				if (node.getAttribute && node.getAttribute("data-cite-token")) return node.getAttribute("data-cite-token");
				const children = Array.from(node.childNodes).map(inline).join("");
				if (tag === "br") return "\n";
				if (tag === "strong" || tag === "b") return children ? "**" + children + "**" : "";
				if (tag === "em" || tag === "i") return children ? "*" + children + "*" : "";
				if (tag === "code") return children ? "`" + children + "`" : "";
				if (tag === "a") {
					const href = node.getAttribute("href") || "";
					return href ? "[" + children + "](" + href + ")" : children;
				}
				if (tag === "img") {
					const origin = node.getAttribute("data-md-src") || node.getAttribute("src") || "";
					const alt = node.getAttribute("alt") || "";
					return origin ? "![" + alt + "](" + origin + ")" : "";
				}
				return children;
			};
			const pushList = (line) => {
				const last = blocks[blocks.length - 1];
				if (last && /^(\s*[-*+]\s|\s*\d+\.\s)/.test(last.split("\n").pop())) blocks[blocks.length - 1] = last + "\n" + line;
				else blocks.push(line);
			};
			const block = (node) => {
				if (node.nodeType === 3) {
					const text = String(node.nodeValue || "").trim();
					if (text) blocks.push(text);
					return;
				}
				if (node.nodeType !== 1) return;
				const tag = node.tagName.toLowerCase();
				if (/^h[1-6]$/.test(tag)) {
					blocks.push("#".repeat(Number(tag[1])) + " " + inline(node).trim());
					return;
				}
				if (tag === "p") {
					const text = inline(node).trim();
					if (text) blocks.push(text);
					return;
				}
				if (tag === "blockquote") {
					const text = inline(node).trim();
					if (text) blocks.push(text.split("\n").map((line) => "> " + line).join("\n"));
					return;
				}
				if (tag === "pre") {
					blocks.push("```\n" + String(node.textContent || "").replace(/\n$/, "") + "\n```");
					return;
				}
				if (tag === "ul" || tag === "ol") {
					Array.from(node.children).filter((child) => child.tagName && child.tagName.toLowerCase() === "li").forEach((li, index) => {
						pushList((tag === "ol" ? index + 1 + ". " : "- ") + inline(li).trim());
					});
					return;
				}
				if (tag === "table") {
					const rows = Array.from(node.querySelectorAll("tr")).map((tr) => Array.from(tr.children).map((cell) => inline(cell).trim()));
					if (!rows.length) return;
					const header = rows[0];
					blocks.push([
						"| " + header.join(" | ") + " |",
						"| " + header.map(() => "---").join(" | ") + " |",
						...rows.slice(1).map((row) => "| " + row.join(" | ") + " |")
					].join("\n"));
					return;
				}
				if (tag === "hr") {
					blocks.push("---");
					return;
				}
				if (tag === "div" || tag === "span" || tag === "section") {
					if (node.childElementCount === 0) {
						const text = inline(node).trim();
						if (text) blocks.push(text);
						return;
					}
					Array.from(node.childNodes).forEach(block);
					return;
				}
				const text = inline(node).trim();
				if (text) blocks.push(text);
			};
			Array.from(root.childNodes).forEach(block);
			return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
		}
		function DocBtn(title, onClick, children, disabled) {
			return h("button", {
				type: "button",
				className: "ap-doc-btn",
				title,
				disabled: !!disabled,
				onClick
			}, children);
		}
		function uploadBytes(cwd, relativePath, file) {
			const url = `/api/agent-pi/files/upload?cwd=${encodeURIComponent(cwd)}&relativePath=${encodeURIComponent(relativePath)}`;
			return file.arrayBuffer().then((buf) => fetch(url, {
				method: "POST",
				body: buf
			})).then(async (res) => {
				const body = await res.json().catch(() => ({}));
				if (!res.ok) throw new Error(body.error || res.statusText);
				return body;
			});
		}
		function uploadKbBytes(cwd, file, meta) {
			const qs = new URLSearchParams();
			qs.set("cwd", cwd || "");
			qs.set("fileName", file.name || "document.bin");
			if (meta && meta.sessionId) qs.set("sessionId", meta.sessionId);
			if (meta && meta.category) qs.set("category", meta.category);
			if (meta && meta.name) qs.set("name", meta.name);
			if (meta && meta.stage) qs.set("stage", "1");
			const url = "/api/agent-pi/kb/bytes?" + qs.toString();
			return file.arrayBuffer().then((buf) => fetch(url, {
				method: "POST",
				body: buf
			})).then(async (res) => {
				const body = await res.json().catch(() => ({}));
				if (!res.ok) throw new Error(body.error || res.statusText);
				return body;
			});
		}
		const FILE_SOURCE = "workspace-file";
		const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
		const TEXT_EXT = /\.(md|txt|json|jsonl|csv|tsv|xml|ya?ml|html|css|js|ts|tsx|py|go|rs|java|c|h|cpp|log|ini|toml|svg)$/i;
		const runtime = {
			sessions: null,
			workspaces: null,
			locale: null,
			sessionId: "",
			cwd: "",
			files: [],
			conversation: null,
			uiConversation: null,
			remote: null
		};
		const attachState = window.__apAttachState || (window.__apAttachState = {
			bySession: /* @__PURE__ */ new Map(),
			listeners: /* @__PURE__ */ new Set(),
			last: [],
			items: []
		});
		if (!Array.isArray(attachState.items)) attachState.items = Array.isArray(attachState.last) ? attachState.last : [];
		if (!attachState.listeners || typeof attachState.listeners.forEach !== "function") attachState.listeners = /* @__PURE__ */ new Set();
		const kbPickState = window.__apKbPick || (window.__apKbPick = {
			entries: [],
			pickedLabel: "",
			notice: "",
			error: "",
			listeners: /* @__PURE__ */ new Set(),
			addManyPaths: null,
			addBrowserFiles: null
		});
		if (!Array.isArray(kbPickState.entries)) kbPickState.entries = [];
		if (!kbPickState.listeners || typeof kbPickState.listeners.forEach !== "function") kbPickState.listeners = /* @__PURE__ */ new Set();
		function kbPickNotify() {
			kbPickState.listeners.forEach((fn) => {
				try {
					fn();
				} catch {}
			});
		}
		function kbPickPatch(patch) {
			Object.assign(kbPickState, patch);
			kbPickNotify();
		}
		function kbPickUpsert(entry) {
			if (!entry || !entry.slug) return;
			const localName = "local:" + (entry.name || entry.originalName || "");
			kbPickState.entries = [entry].concat(kbPickState.entries.filter((item) => item && item.slug !== entry.slug && item.slug !== localName));
			kbPickNotify();
		}
		function kbPickerHome() {
			if (typeof document === "undefined") return null;
			let home = document.getElementById("ap-kb-picker-home");
			if (home) return home;
			home = document.createElement("div");
			home.id = "ap-kb-picker-home";
			home.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none";
			document.body.appendChild(home);
			return home;
		}
		function ensureKbFileInput() {
			if (typeof document === "undefined") return null;
			let el = document.getElementById("ap-kb-file-input");
			if (el) return el;
			el = document.createElement("input");
			el.id = "ap-kb-file-input";
			el.type = "file";
			el.multiple = true;
			el.className = "ap-kb-native";
			el.accept = ".md,.markdown,.txt,.json,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.jp2,.webp,.gif,.bmp";
			el.addEventListener("change", () => {
				const files = el.files;
				const names = Array.from(files || []).map((file) => file.name).join("、");
				if (names) kbPickPatch({
					pickedLabel: names,
					error: "",
					notice: names
				});
				const picked = Array.from(files || []);
				kbPickState.pendingFiles = picked;
				if (typeof kbPickState.addBrowserFiles === "function") {
					kbPickState.pendingFiles = [];
					kbPickState.addBrowserFiles(picked);
				} else picked.forEach((file) => kbPickUpsert({
					slug: "local:" + (file.name || "file"),
					name: file.name || "file",
					parseStatus: "staged",
					parseProgress: "已选中，等待界面接手…",
					sizeBytes: file.size || 0
				}));
				el.value = "";
			});
			const home = kbPickerHome();
			if (home) home.appendChild(el);
			return el;
		}
		function parkKbFileInput() {
			const el = ensureKbFileInput();
			const home = kbPickerHome();
			if (el && home && el.parentNode !== home) home.appendChild(el);
			return el;
		}
		function attachSessionId(props) {
			return resolveSessionId(props) || runtime.sessionId || "";
		}
		function notifyAttach() {
			try {
				window.dispatchEvent(new CustomEvent("agent-pi-attach-changed", { detail: { items: attachState.items || [] } }));
			} catch {}
			attachState.listeners.forEach((fn) => {
				try {
					fn();
				} catch {}
			});
		}
		function attachItemsOf(sessionId) {
			if (sessionId) return attachState.bySession.get(sessionId) || [];
			if (attachState.items && attachState.items.length) return attachState.items;
			return attachState.last || [];
		}
		function codexAttachItems(sessionId) {
			if (!sessionId || !attachState.bySession || !attachState.bySession.has(sessionId)) return [];
			return attachState.bySession.get(sessionId) || [];
		}
		function codexAttachmentToken(item) {
			return item && item.id ? "id:" + item.id : item;
		}
		function setCodexAttachItems(sessionId, items) {
			if (!sessionId) return;
			const next = Array.isArray(items) ? items : [];
			attachState.bySession.set(sessionId, next);
			if (activeSessionId() !== sessionId) return;
			attachState.items = next;
			attachState.last = next;
			notifyAttach();
		}
		function setAttachItemsFor(sessionId, items) {
			const next = Array.isArray(items) ? items : [];
			if (sessionId) attachState.bySession.set(sessionId, next);
			if (sessionId && activeSessionId() !== sessionId) return;
			attachState.items = next;
			attachState.last = next;
			notifyAttach();
		}
		function useAttachItems() {
			const [items, setItems] = react.useState(() => attachItemsOf(activeSessionId()).slice());
			react.useEffect(() => {
				const sync = () => setItems(attachItemsOf(activeSessionId()).slice());
				attachState.listeners.add(sync);
				window.addEventListener("agent-pi-attach-changed", sync);
				sync();
				return () => {
					attachState.listeners.delete(sync);
					window.removeEventListener("agent-pi-attach-changed", sync);
				};
			}, []);
			return [items, (next) => {
				const sessionId = activeSessionId() || "pending";
				const current = attachItemsOf(sessionId);
				setAttachItemsFor(sessionId, typeof next === "function" ? next(current) : next);
			}];
		}
		function flattenFiles(nodes, out) {
			for (const node of nodes || []) {
				if (node.type !== "directory") out.push({
					name: node.name,
					relativePath: (node.relativePath || node.path || "").replace(/\\/g, "/"),
					path: node.path
				});
				flattenFiles(node.children, out);
			}
			return out;
		}
		function fileKind(name, mime) {
			if (String(mime || "").toLowerCase().startsWith("image/") || IMAGE_EXT.test(String(name || ""))) return "image";
			const ext = String(name || "").split(".").pop().toLowerCase();
			if (ext === "pdf") return "pdf";
			if (TEXT_EXT.test(String(name || "")) || ext === "md" || ext === "txt" || ext === "json" || ext === "csv") return "text";
			return "file";
		}
		function folderNameOf(dir) {
			return String(dir || "").replace(/[\\/]+$/, "").split(/[\\/]/).pop() || String(dir || "");
		}
		function showToast(text) {
			if (!text) return;
			window.dispatchEvent(new CustomEvent("agent-pi-toast", { detail: { text } }));
		}
		function resolveSessionId(props) {
			return sessionHint(props) || runtime.sessionId || composerFace.sessionId || "";
		}
		function revealComposerAfterAttach() {
			window.dispatchEvent(new Event("agent-pi-close-preview"));
			window.requestAnimationFrame(() => {
				const ta = document.querySelector("[data-composer-card] textarea, [data-phase] textarea");
				if (!ta) return;
				try {
					ta.scrollIntoView({
						block: "nearest",
						behavior: "smooth"
					});
				} catch {}
				try {
					ta.focus();
				} catch {}
			});
		}
		function readDraft() {
			return composerFace.draft || "";
		}
		function currentDraft(props) {
			if (props && props.input && typeof props.input.draft === "string") return props.input.draft;
			const ta = document.querySelector("[data-composer-card] textarea, [data-phase] textarea");
			if (ta && typeof ta.value === "string") return ta.value;
			return composerFace.draft || "";
		}
		function setComposerDraft(props, text) {
			if (props && props.inputActions && typeof props.inputActions.setDraft === "function") {
				props.inputActions.setDraft(text);
				return;
			}
			fillComposer(props, text);
		}
		function stripMentionArtifacts(draft) {
			return String(draft || "").replace(/\uFFFC\s*/g, "").replace(/请读取并依据此文件：[`'“”‘'][^`'“”‘']*[`'“”‘']/g, "").replace(/<!--agent-pi-attachments-->[\s\S]*?<!--\/agent-pi-attachments-->/g, "").replace(/<!--agent-pi-kb-task-->[\s\S]*?<!--\/agent-pi-kb-task-->/g, "").replace(/<!--agent-pi-attachment-tx:[^>]+?-->/g, "").replace(/<attached-image\b[^>]*>[\s\S]*?<\/attached-image>/g, "").replace(/The user attached an image\. The following is a faithful visual reading[\s\S]*$/g, "").replace(/The user attached \d+ images\. The following are faithful visual readings[\s\S]*$/g, "").replace(/\n{3,}/g, "\n\n").trim();
		}
		function cleanComposerDraft(props) {
			const draft = currentDraft(props);
			const next = stripMentionArtifacts(draft);
			if (next !== draft) setComposerDraft(props, next);
		}
		function filePreviewUrl(props, file) {
			if (fileKind(file.name || file.relativePath) !== "image") return "";
			const cwd = workspaceCwd(props);
			if (!cwd || !file.path) return "";
			return `/api/agent-pi/files/raw?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(file.path)}`;
		}
		function attachKey(item) {
			return String(item.path || item.relativePath || item.ref || item.name || "").replace(/\\/g, "/");
		}
		function workspaceRel(file) {
			let rel = String(file && (file.relativePath || file.ref || file.path || file.name) || "").replace(/\\/g, "/");
			const cwd = String(workspaceCwd() || "").replace(/\\/g, "/").replace(/\/+$/, "");
			if (cwd && rel.length > cwd.length && rel.slice(0, cwd.length).toLowerCase() === cwd.toLowerCase() && rel.charAt(cwd.length) === "/") rel = rel.slice(cwd.length + 1);
			return rel;
		}
		function mentionToken(file) {
			const rel = workspaceRel(file);
			if (!rel) return "";
			return /[\s"'`]/.test(rel) ? "@\"" + rel + "\"" : "@" + rel;
		}
		function formatAttachVisible(items) {
			const tokens = [];
			for (const item of items || []) {
				if (!item || item.kind === "image") continue;
				const token = mentionToken(item);
				if (token && tokens.indexOf(token) < 0) tokens.push(token);
			}
			return tokens.join(" ");
		}
		function stripComposerMentions(files) {
			const live = composerPropsRef.current;
			const codexPhase = codexTurnPhase(live);
			if (codexPhase === "preparing" || codexPhase === "submitting") return;
			const attachmentController = attachmentTurnControllers.get(attachmentTurnKey(live));
			if (attachmentController && (attachmentController.phase === "preparing" || attachmentController.phase === "submitting")) return;
			let draft = currentDraft(live);
			if (!draft) {
				const ta = document.querySelector("[data-composer-card] textarea, [data-phase] textarea");
				draft = ta && typeof ta.value === "string" ? ta.value : "";
			}
			if (!draft) return;
			let next = draft;
			for (const file of files || []) {
				const token = mentionToken(file);
				if (token) next = next.split(token).join("");
				const rel = String(file && (file.relativePath || file.ref || file.path || "") || "").replace(/\\/g, "/");
				if (rel) {
					next = next.split("@\"" + rel + "\"").join("");
					next = next.split("@" + rel).join("");
				}
			}
			next = next.replace(/@"(?:Agent Pi Outputs|Official Outputs|工作成果)\/[^"\n]+"/g, "").replace(/[ \t]*\n{2,}/g, "\n").replace(/^[ \t\n]+|[ \t\n]+$/g, "");
			if (next !== draft) setComposerDraft(live, next);
		}
		function attachItemsToComposer(props, items, source) {
			const list = (items || []).filter((item) => item && (item.relativePath || item.ref || item.path || item.name));
			if (!list.length) return;
			try {
				const live = snapshotComposer();
				const sid = sessionHint(live) || sessionHint(props) || runtime.sessionId || "pending";
				const cwd = runtime.cwd;
				stripComposerMentions(list);
				cleanComposerDraft(live);
				const incoming = list.map((item) => ({
					id: item.id || attachKey(item) + ":" + Date.now(),
					relativePath: String(item.relativePath || item.ref || item.path || item.name || "").replace(/\\/g, "/"),
					path: item.path || "",
					name: item.name || String(item.relativePath || item.path || item.name || "").split(/[\\/]/).pop(),
					kind: item.kind || fileKind(item.name),
					previewUrl: item.previewUrl || "",
					uploaded: !!item.uploaded,
					loaded: true,
					text: item.text || "",
					size: item.size,
					cwd: item.cwd || cwd || "",
					sessionId: sid,
					file: item.file
				}));
				const visual = incoming.filter((item) => item.kind === "image");
				const docs = incoming.filter((item) => item.kind !== "image");
				if (visual.length) Promise.all(visual.map(async (item) => {
					if (item.file) return item.file;
					const url = item.previewUrl || (cwd && item.path ? `/api/agent-pi/files/raw?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(item.path)}` : "");
					if (!url) return null;
					const blob = await fetch(url).then((res) => {
						if (!res.ok) throw new Error(res.statusText);
						return res.blob();
					});
					return new File([blob], item.name, { type: blob.type || "image/png" });
				})).then((files) => attachNativeImages(live, files.filter(Boolean))).catch((err) => showToast(String(err && err.message || err))).finally(() => revealComposerAfterAttach());
				if (!docs.length) {
					if (!visual.length) showToast("该文件已在对话栏中");
					if (!visual.length) revealComposerAfterAttach();
					return;
				}
				const merged = attachItemsOf(sid).slice();
				const added = [];
				for (const item of docs) {
					const key = attachKey(item);
					if (key && merged.some((row) => attachKey(row) === key || row.name && row.name === item.name && row.kind === item.kind)) continue;
					merged.push(item);
					added.push(item);
				}
				if (!added.length) {
					if (!visual.length) showToast("该文件已在对话栏中");
					revealComposerAfterAttach();
					return;
				}
				setAttachItemsFor(sid, merged);
				stripComposerMentions(merged);
				if (source === "folder") showToast(added.length === 1 ? "已加入文件夹：" + added[0].name : "已加入 " + added.length + " 个文件夹");
				else if (source === "upload") showToast(added.length === 1 ? "已加入对话：" + added[0].name : "已加入对话 " + added.length + " 个文件");
				else showToast(added.length === 1 ? tAp("files.attachedOne", { name: added[0].name }) : tAp("files.attachedMany", { n: added.length }));
				revealComposerAfterAttach();
			} catch (err) {
				const msg = String(err && err.message || err);
				showToast(/#321|Invalid hook call/i.test(msg) ? "加入对话失败，请先点菜单「视图 → 刷新」再试" : msg);
			}
		}
		function restoreCleanDraft(props) {
			const draft = stripMentionArtifacts(currentDraft(props));
			if (draft !== currentDraft(props)) setComposerDraft(props, draft);
			return draft;
		}
		function isLiveSessionId(sid) {
			return Boolean(sid) && sid !== "pending" && sid !== "active";
		}
		function attachmentTurnKey(props) {
			return attachSessionId(props) || runtime.sessionId || "active";
		}
		function attachmentTransactionId(key) {
			return "attachment:" + key + ":" + Date.now() + ":" + Math.random().toString(36).slice(2, 9);
		}
		function attachmentTransactionMarker(token) {
			if (!token || !token.hostRequested || !token.hostTransactionId) return "";
			return "<!--agent-pi-attachment-tx:" + encodeURIComponent(token.hostTransactionId) + "-->";
		}
		function clearAttachmentTurnStatus(token) {
			if (!token || !token.statusTimer) return;
			try {
				window.clearTimeout(token.statusTimer);
			} catch {}
			token.statusTimer = null;
		}
		function submissionHasNewPromptError(snapshot, controller) {
			const current = snapshot && snapshot.promptError;
			if (!current) {
				if (controller.preSubmitPromptErrorRef) controller.promptErrorBaselineCleared = true;
				return false;
			}
			if (current.op !== "send") return false;
			return !controller.preSubmitPromptErrorRef || controller.promptErrorBaselineCleared || current !== controller.preSubmitPromptErrorRef || JSON.stringify(current) !== controller.preSubmitPromptErrorToken;
		}
		function submissionOwnsDraft(controller, input) {
			if (!input) return false;
			if (input.draft === controller.framedDraft) return true;
			return controller.acceptedDraft === "" && input.draft === controller.acceptedDraft && controller.acceptedDraftRev !== null && input.draftRev === controller.acceptedDraftRev;
		}
		function disposeAttachmentTurnInput(controller) {
			const unsubscribe = controller.unsubscribeInput;
			controller.unsubscribeInput = null;
			if (typeof unsubscribe === "function") try {
				unsubscribe();
			} catch {}
		}
		function disposeAttachmentTurnSession(controller) {
			const unsubscribe = controller.unsubscribeSession;
			controller.unsubscribeSession = null;
			if (typeof unsubscribe === "function") try {
				unsubscribe();
			} catch {}
		}
		function closeAttachmentTurn(key, controller, phase) {
			if (attachmentTurnControllers.get(key) !== controller) return;
			controller.phase = phase;
			clearAttachmentTurnStatus(controller.attemptToken);
			disposeAttachmentTurnInput(controller);
			disposeAttachmentTurnSession(controller);
			attachmentTurnControllers.delete(key);
		}
		function cancelAttachmentTurnHost(key, controller, attemptToken) {
			const token = attemptToken || controller.attemptToken;
			if (!token || !token.hostRequested || !token.hostTransactionId || token.hostDelivered === true) return;
			if (!token.prepareSettled) {
				token.cancelWhenPrepared = true;
				return;
			}
			if (token.cancelRequested) return;
			token.cancelRequested = true;
			api("/api/agent-pi/llm/vision/read?sessionId=" + encodeURIComponent(key), controller.cwd || "", {
				method: "POST",
				body: JSON.stringify({
					action: "cancel",
					sessionId: key,
					transactionId: token.hostTransactionId
				})
			}).catch(() => {});
		}
		async function commitAttachmentTurnHost(key, controller, token) {
			if (!token.hostRequested) return;
			const result = await api("/api/agent-pi/llm/vision/read?sessionId=" + encodeURIComponent(key), controller.cwd || "", {
				method: "POST",
				timeoutMs: 3e4,
				body: JSON.stringify({
					action: "commit",
					sessionId: key,
					transactionId: token.hostTransactionId
				})
			});
			if (!result || result.committed !== true || result.sessionId !== key || result.transactionId !== token.hostTransactionId) throw new Error("附件上下文提交失败，请重试");
			token.hostCommitted = true;
		}
		function attachmentTurnStillOwns(key, controller, token, kind) {
			return (kind === "codex" ? codexTurnControllers.get(key) : attachmentTurnControllers.get(key)) === controller && controller.attemptToken === token && controller.phase === "submitting";
		}
		function scheduleAttachmentTurnStatus(key, controller, token, kind, delay) {
			if (!token.hostRequested || !token.hostCommitted || token.statusTimer || token.statusPending) return;
			token.statusTimer = window.setTimeout(() => {
				token.statusTimer = null;
				pollAttachmentTurnStatus(key, controller, token, kind);
			}, delay == null ? 750 : delay);
		}
		async function pollAttachmentTurnStatus(key, controller, token, kind) {
			if (!attachmentTurnStillOwns(key, controller, token, kind) || token.statusPending) return;
			token.statusPending = true;
			try {
				const status = await api("/api/agent-pi/llm/vision/read?sessionId=" + encodeURIComponent(key), controller.cwd || "", {
					method: "POST",
					timeoutMs: 5e3,
					body: JSON.stringify({
						action: "status",
						sessionId: key,
						transactionId: token.hostTransactionId
					})
				});
				if (!attachmentTurnStillOwns(key, controller, token, kind)) return;
				if (!status || status.sessionId !== key || status.transactionId !== token.hostTransactionId) {
					if (kind === "codex") failCodexTurn(key, controller, controller.inputStore);
					else failAttachmentTurn(key, controller, controller.inputStore);
					return;
				}
				if (status.state === "delivered") {
					token.hostDelivered = true;
					if (kind === "codex") clearCodexTurnAfterSubmit(key, controller);
					else clearAttachmentTurnAfterSubmit(key, controller);
					return;
				}
				if (status.state === "failed" || status.state === "cancelled" || status.state === "destroyed" || status.state === "unknown") {
					if (kind === "codex") failCodexTurn(key, controller, controller.inputStore);
					else failAttachmentTurn(key, controller, controller.inputStore);
					return;
				}
			} catch {} finally {
				token.statusPending = false;
			}
			if (attachmentTurnStillOwns(key, controller, token, kind)) scheduleAttachmentTurnStatus(key, controller, token, kind, 1e3);
		}
		function restoreAttachmentTurnItems(key, controller) {
			const current = codexAttachItems(key).slice();
			const currentIds = codexAttachmentIds(current);
			const missing = [];
			for (const item of controller.capturedAttachments) {
				const id = codexAttachmentToken(item);
				const index = currentIds.indexOf(id);
				if (index >= 0) currentIds.splice(index, 1);
				else missing.push(item);
			}
			if (missing.length) setCodexAttachItems(key, missing.concat(current));
		}
		function abortAttachmentTurn(key, controller) {
			if (attachmentTurnControllers.get(key) !== controller) return;
			cancelAttachmentTurnHost(key, controller);
			closeAttachmentTurn(key, controller, "failed");
		}
		function failAttachmentTurn(key, controller, inputStore) {
			if (attachmentTurnControllers.get(key) !== controller) return;
			let ownsFramedDraft = false;
			const authoritativeInputStore = inputStore || controller.inputStore;
			try {
				ownsFramedDraft = submissionOwnsDraft(controller, authoritativeInputStore && authoritativeInputStore.getSnapshot());
			} catch {}
			const live = controller.latestProps;
			const originalDraft = controller.originalDraft;
			restoreAttachmentTurnItems(key, controller);
			cancelAttachmentTurnHost(key, controller);
			closeAttachmentTurn(key, controller, "failed");
			if (ownsFramedDraft) try {
				setComposerDraft(live, originalDraft);
			} catch {}
		}
		function destroyAttachmentTurn(key, controller) {
			if (attachmentTurnControllers.get(key) !== controller) return;
			cancelAttachmentTurnHost(key, controller);
			closeAttachmentTurn(key, controller, "destroyed");
			attachState.bySession.delete(key);
			if (activeSessionId() === key) {
				attachState.items = [];
				attachState.last = [];
				notifyAttach();
			}
		}
		function clearAttachmentTurnAfterSubmit(key, controller) {
			if (attachmentTurnControllers.get(key) !== controller || controller.phase !== "submitting") return;
			const capturedIds = controller.capturedAttachmentIds.slice();
			const remainingIds = capturedIds.slice();
			const remaining = codexAttachItems(key).filter((item) => {
				const index = remainingIds.indexOf(codexAttachmentToken(item));
				if (index < 0) return true;
				remainingIds.splice(index, 1);
				return false;
			});
			cancelAttachmentTurnHost(key, controller);
			closeAttachmentTurn(key, controller, "succeeded");
			if (capturedIds.length) setCodexAttachItems(key, remaining);
		}
		function settleAttachmentTurn(key, token) {
			const controller = attachmentTurnControllers.get(key);
			if (!controller || controller.phase !== "submitting" || controller.attemptToken !== token) return;
			let authorities;
			try {
				authorities = codexTurnAuthorities(key);
			} catch {
				failAttachmentTurn(key, controller, null);
				return;
			}
			if (!authorities) {
				failAttachmentTurn(key, controller, null);
				return;
			}
			const session = authorities.session;
			const inputStore = authorities.inputStore;
			let snapshot;
			let inputSnapshot;
			try {
				snapshot = sessionSnapshotWithChat(key, session);
				inputSnapshot = inputStore && typeof inputStore.getSnapshot === "function" ? inputStore.getSnapshot() : null;
			} catch {
				failAttachmentTurn(key, controller, inputStore);
				return;
			}
			if (!snapshot || !inputSnapshot) {
				failAttachmentTurn(key, controller, inputStore);
				return;
			}
			if (snapshot.removed === true) {
				destroyAttachmentTurn(key, controller);
				return;
			}
			if (codexUserNode(snapshot, controller)) {
				if (!token.hostRequested) clearAttachmentTurnAfterSubmit(key, controller);
				return;
			}
			const previousPhase = controller.lastInputPhase;
			const previousDraftRev = controller.lastInputDraftRev;
			const inputPhase = inputSnapshot.phase;
			const inputDraftRev = typeof inputSnapshot.draftRev === "number" ? inputSnapshot.draftRev : null;
			if (inputPhase === "submitting") controller.sawSubmitting = true;
			controller.lastInputPhase = inputPhase;
			controller.lastInputDraftRev = inputDraftRev;
			if (inputPhase === "submitting") return;
			if (submissionHasNewPromptError(snapshot, controller)) {
				failAttachmentTurn(key, controller, inputStore);
				return;
			}
			if (controller.sawSubmitting && previousPhase === "submitting" && inputPhase === "plain" && inputDraftRev !== null && previousDraftRev !== null) {
				if (inputDraftRev === previousDraftRev) failAttachmentTurn(key, controller, inputStore);
				return;
			}
		}
		function watchAttachmentTurnSession(key, controller) {
			if (typeof controller.unsubscribeSession === "function") return true;
			let authorities;
			try {
				authorities = codexTurnAuthorities(key);
			} catch {
				return false;
			}
			const session = authorities && authorities.session;
			if (!session || typeof session.getSnapshot !== "function" || typeof session.subscribe !== "function") return false;
			const onSession = () => {
				if (attachmentTurnControllers.get(key) !== controller) return;
				let snapshot;
				try {
					snapshot = sessionSnapshotWithChat(key, session);
				} catch {
					return;
				}
				if (snapshot && snapshot.removed === true) {
					destroyAttachmentTurn(key, controller);
					return;
				}
				const token = controller.attemptToken;
				if (controller.phase !== "submitting" || !token) return;
				if (!token.settlementReady) token.settlementQueued = true;
				else settleAttachmentTurn(key, token);
			};
			let unsubscribe;
			try {
				unsubscribe = subscribeSessionWithChat(key, session, onSession);
			} catch {
				return false;
			}
			if (typeof unsubscribe !== "function") return false;
			if (attachmentTurnControllers.get(key) !== controller) {
				try {
					unsubscribe();
				} catch {}
				return false;
			}
			controller.unsubscribeSession = unsubscribe;
			return true;
		}
		function preparingAttachmentTurn(key, token) {
			const controller = attachmentTurnControllers.get(key);
			if (!controller || controller.phase !== "preparing" || controller.attemptToken !== token) return null;
			let authorities;
			try {
				authorities = codexTurnAuthorities(key);
			} catch {
				abortAttachmentTurn(key, controller);
				return null;
			}
			if (!authorities) {
				abortAttachmentTurn(key, controller);
				return null;
			}
			const session = authorities.session;
			const inputStore = authorities.inputStore;
			if (!session || typeof session.getSnapshot !== "function" || !inputStore || typeof inputStore.getSnapshot !== "function") {
				abortAttachmentTurn(key, controller);
				return null;
			}
			let sessionSnapshot;
			let inputSnapshot;
			try {
				sessionSnapshot = sessionSnapshotWithChat(key, session);
				inputSnapshot = inputStore.getSnapshot();
			} catch {
				abortAttachmentTurn(key, controller);
				return null;
			}
			if (sessionSnapshot && sessionSnapshot.removed === true) {
				destroyAttachmentTurn(key, controller);
				return null;
			}
			const live = controller.latestProps;
			const attachmentIds = codexAttachmentIds(codexAttachItems(key));
			if (!sessionSnapshot || !inputSnapshot || inputSnapshot.phase !== "plain" || inputSnapshot.draft !== controller.originalDraft || !live || attachmentTurnKey(live) !== key || !sameCodexAttachmentIds(attachmentIds, controller.capturedAttachmentIds) || !sameCodexAttachmentIds(nativeCodexAttachmentIds(inputSnapshot), controller.capturedNativeAttachmentIds) || !sameCodexAttachmentIds(kbTaskOf(key).slugs, controller.capturedKbSlugs)) {
				abortAttachmentTurn(key, controller);
				return null;
			}
			return {
				controller,
				live,
				sessionSnapshot,
				inputStore
			};
		}
		function attachmentPreparedDraft(key, controller, token) {
			const clean = stripMentionArtifacts(controller.originalDraft);
			const attachLine = formatAttachVisible(controller.capturedAttachments);
			const block = formatKbTaskBlock(key);
			const fallback = controller.capturedAttachments.length || controller.capturedNativeAttachmentIds.length ? "请结合附件作答。" : "";
			const body = [clean, attachLine].filter(Boolean).join("\n\n");
			const draft = block ? body ? block + "\n\n" + body : block + (fallback ? "\n\n" + fallback : "") : body || fallback;
			const marker = attachmentTransactionMarker(token);
			return marker ? [draft, marker].filter(Boolean).join("\n\n") : draft;
		}
		async function prepareAttachmentTurn(key, token) {
			const controller = attachmentTurnControllers.get(key);
			if (!controller || controller.phase !== "preparing" || controller.attemptToken !== token) return;
			try {
				await flushKbTaskSelection(key);
			} catch {
				token.prepareSettled = true;
				abortAttachmentTurn(key, controller);
				showToast("知识库选项尚未保存，请重试选择后再发送。");
				return;
			}
			if (!preparingAttachmentTurn(key, token)) return;
			if (controller.capturedAttachments.some((item) => item.cwd && controller.cwd && normPath(item.cwd) !== normPath(controller.cwd))) {
				token.prepareSettled = true;
				abortAttachmentTurn(key, controller);
				showToast("附件来自另一个工作区，请重新添加后再发送");
				return;
			}
			const items = controller.capturedAttachments;
			const files = items.filter((item) => item.kind !== "image" && item.kind !== "folder" && (item.path || item.relativePath || item.name));
			const folders = items.filter((item) => item.kind === "folder" && (item.path || item.relativePath));
			if (files.length || folders.length) {
				if (!isLiveSessionId(key) || !controller.cwd) {
					token.prepareSettled = true;
					abortAttachmentTurn(key, controller);
					showToast("当前会话没有工作区，无法把附件交给模型");
					return;
				}
				token.hostRequested = true;
				try {
					const result = await api("/api/agent-pi/llm/vision/read?sessionId=" + encodeURIComponent(key), controller.cwd, {
						method: "POST",
						timeoutMs: 3e4,
						body: JSON.stringify({
							sessionId: key,
							transactionId: token.hostTransactionId,
							cwd: controller.cwd,
							files: files.map((item) => ({
								name: item.name,
								path: item.path || item.relativePath,
								relativePath: item.relativePath || item.path,
								kind: "file"
							})),
							folders: folders.map((item) => ({
								name: item.name,
								path: item.path || item.relativePath
							})),
							images: []
						})
					});
					if (!result || result.stored !== true || result.sessionId !== key || result.transactionId !== token.hostTransactionId) throw new Error("附件上下文准备失败，请重试");
					token.prepareSettled = true;
					token.hostPrepared = true;
					if (token.cancelWhenPrepared || attachmentTurnControllers.get(key) !== controller) {
						cancelAttachmentTurnHost(key, controller, token);
						return;
					}
				} catch (err) {
					token.prepareSettled = true;
					cancelAttachmentTurnHost(key, controller, token);
					abortAttachmentTurn(key, controller);
					showToast(String(err && err.message || err));
					return;
				}
			} else token.prepareSettled = true;
			if (!preparingAttachmentTurn(key, token)) return;
			controller.framedDraft = attachmentPreparedDraft(key, controller, token);
			requestAnimationFrame(() => {
				commitAttachmentTurn(key, token);
			});
		}
		async function commitAttachmentTurn(key, token) {
			let prepared = preparingAttachmentTurn(key, token);
			if (!prepared) return;
			const controller = prepared.controller;
			if (token.hostRequested) try {
				await commitAttachmentTurnHost(key, controller, token);
			} catch (error) {
				cancelAttachmentTurnHost(key, controller, token);
				failAttachmentTurn(key, controller, prepared.inputStore);
				showToast(String(error && error.message || error));
				return;
			}
			try {
				if (hasKbTaskSelectionSave(key)) await flushKbTaskSelection(key);
			} catch {
				abortAttachmentTurn(key, controller);
				showToast("知识库选项尚未保存，请重试选择后再发送。");
				return;
			}
			prepared = preparingAttachmentTurn(key, token);
			if (!prepared) return;
			const inputStore = prepared.inputStore;
			try {
				if (typeof inputStore.subscribe !== "function" || typeof controller.unsubscribeSession !== "function") throw new Error("attachment settlement subscriptions unavailable");
				const actions = prepared.live && prepared.live.inputActions;
				const submit = actions && actions.__apOrigSubmit;
				if (typeof submit !== "function") throw new Error("attachment original submit unavailable");
				controller.preSubmitUserNodeWatermark = codexUserNodeWatermark(prepared.sessionSnapshot);
				controller.preSubmitPromptErrorRef = prepared.sessionSnapshot.promptError || null;
				controller.preSubmitPromptErrorToken = JSON.stringify(prepared.sessionSnapshot.promptError || null);
				controller.promptErrorBaselineCleared = false;
				controller.phase = "submitting";
				setComposerDraft(prepared.live, controller.framedDraft);
				const inputSnapshot = inputStore.getSnapshot();
				controller.lastInputPhase = inputSnapshot && inputSnapshot.phase;
				controller.lastInputDraftRev = inputSnapshot && typeof inputSnapshot.draftRev === "number" ? inputSnapshot.draftRev : null;
				controller.sawSubmitting = controller.lastInputPhase === "submitting";
				token.settlementReady = false;
				token.settlementQueued = false;
				const onSettlement = () => {
					if (!token.settlementReady) {
						token.settlementQueued = true;
						return;
					}
					settleAttachmentTurn(key, token);
				};
				const unsubscribe = inputStore.subscribe(onSettlement);
				if (typeof unsubscribe !== "function") throw new Error("attachment input settlement subscription unavailable");
				controller.unsubscribeInput = unsubscribe;
				token.settlementReady = true;
				submit();
				const acceptedInput = inputStore.getSnapshot();
				controller.acceptedDraft = acceptedInput && typeof acceptedInput.draft === "string" ? acceptedInput.draft : null;
				controller.acceptedDraftRev = acceptedInput && typeof acceptedInput.draftRev === "number" ? acceptedInput.draftRev : null;
				scheduleAttachmentTurnStatus(key, controller, token, "normal", 250);
				if (token.settlementQueued) settleAttachmentTurn(key, token);
			} catch {
				failAttachmentTurn(key, controller, inputStore);
			}
		}
		function submitAttachmentTurn(props) {
			const key = attachmentTurnKey(props);
			if (attachmentTurnControllers.has(key)) return;
			const codexController = codexTurnControllers.get(key);
			if (codexController && (codexController.phase === "preparing" || codexController.phase === "submitting")) {
				showToast("当前会话已有 Codex 附件事务，请等待完成后重试");
				return;
			}
			let authorities;
			let sessionSnapshot;
			let inputSnapshot;
			try {
				authorities = codexTurnAuthorities(key);
				if (!authorities || !authorities.session || !authorities.inputStore) {
					showToast("当前会话正在切换，请稍后重试");
					return;
				}
				sessionSnapshot = sessionSnapshotWithChat(key, authorities.session);
				inputSnapshot = authorities.inputStore.getSnapshot();
			} catch {
				showToast("当前会话状态不可用，请刷新后重试");
				return;
			}
			if (!sessionSnapshot || sessionSnapshot.removed === true || !inputSnapshot || inputSnapshot.phase !== "plain" || typeof inputSnapshot.draft !== "string") {
				showToast("当前会话正在切换或输入状态忙，请稍后重试");
				return;
			}
			const cleanDraft = stripMentionArtifacts(inputSnapshot.draft);
			if (cleanDraft !== inputSnapshot.draft) try {
				setComposerDraft(props, cleanDraft);
				inputSnapshot = authorities.inputStore.getSnapshot();
			} catch {
				return;
			}
			const attachments = codexAttachItems(key).slice();
			const token = {
				prepareSettled: false,
				cancelWhenPrepared: false,
				cancelRequested: false,
				hostRequested: false,
				hostPrepared: false,
				hostCommitted: false,
				hostTransactionId: attachmentTransactionId(key)
			};
			const controller = {
				phase: "preparing",
				latestProps: props,
				attemptToken: token,
				originalDraft: inputSnapshot.draft,
				framedDraft: "",
				capturedAttachments: attachments,
				capturedAttachmentIds: codexAttachmentIds(attachments),
				capturedNativeAttachmentIds: nativeCodexAttachmentIds(inputSnapshot),
				capturedKbSlugs: kbTaskOf(key).slugs.slice(),
				preSubmitUserNodeWatermark: -1,
				preSubmitPromptErrorRef: sessionSnapshot.promptError || null,
				preSubmitPromptErrorToken: JSON.stringify(sessionSnapshot.promptError || null),
				promptErrorBaselineCleared: false,
				lastInputPhase: null,
				lastInputDraftRev: null,
				sawSubmitting: false,
				acceptedDraft: null,
				acceptedDraftRev: null,
				cwd: workspaceCwd(props),
				inputStore: authorities.inputStore,
				unsubscribeSession: null,
				unsubscribeInput: null
			};
			attachmentTurnControllers.set(key, controller);
			if (!watchAttachmentTurnSession(key, controller)) {
				closeAttachmentTurn(key, controller, "failed");
				showToast("当前会话状态不可用，请刷新后重试");
				return;
			}
			prepareAttachmentTurn(key, token);
		}
		function foldAndSubmit(props) {
			submitAttachmentTurn(props);
		}
		async function submitCodexTurn(props) {
			const key = codexTurnKey(props);
			const controller = codexTurnController(props, true);
			if (controller.nativePreparing || attachmentTurnControllers.has(key)) return;
			let authority;
			try {
				authority = codexTurnAuthorities(key);
			} catch {
				showToast(tCodexExecution("sessionBusy", langState.lang));
				return;
			}
			const snapshot = authority && sessionSnapshotWithChat(key, authority.session);
			if (!snapshot || snapshot.removed || snapshotIsBusy(snapshot)) {
				showToast(tCodexExecution("sessionBusy", langState.lang));
				return;
			}
			const original = authority.inputStore.getSnapshot().draft || "";
			const attachments = codexAttachItems(key).slice();
			const ids = nativeCodexAttachmentIds(authority.inputStore.getSnapshot());
			const kbSlugs = kbTaskOf(key).slugs.slice();
			const selectedModel = controller.selectedModel;
			const selectedReasoningEffort = controller.selectedReasoningEffort;
			const unchanged = () => {
				const live = codexTurnAuthorities(key);
				const state = live && sessionSnapshotWithChat(key, live.session);
				if (!state || state.removed || snapshotIsBusy(state) || live.session !== authority.session || live.inputStore.getSnapshot().draft !== original || !sameCodexAttachmentIds(codexAttachmentIds(codexAttachItems(key)), codexAttachmentIds(attachments)) || !sameCodexAttachmentIds(nativeCodexAttachmentIds(live.inputStore.getSnapshot()), ids) || !sameCodexAttachmentIds(kbTaskOf(key).slugs, kbSlugs)) throw new Error(tCodexExecution("sessionBusy", langState.lang));
			};
			controller.nativePreparing = true;
			try {
				await flushKbTaskSelection(key);
				const auth = await window.agentPiDesktop?.codexAuthStatus?.();
				if (auth?.state !== "logged-in") throw new Error(tCodexExecution("loginRequired", langState.lang));
				unchanged();
				const selection = resolveCodexTurnSelection(auth, selectedModel, selectedReasoningEffort);
				const cwd = workspaceCwd(props);
				const native = runtime.conversation?.resolveDraftAttachments?.(ids) || [];
				if (native.length !== ids.length) throw new Error(tCodexExecution("attachmentsNotReady", langState.lang));
				const rows = attachments.map((item) => ({
					...item,
					path: item.path || joinPath(cwd, item.relativePath || item.name)
				}));
				for (const item of native) {
					const path = window.agentPiDesktop.pathForFile(item.file);
					if (path) rows.push({
						path,
						name: item.file.name,
						kind: item.kind
					});
					else if (item.kind === "image") {
						const dataUrl = await new Promise((resolve, reject) => {
							const reader = new FileReader();
							reader.onload = () => resolve(reader.result);
							reader.onerror = reject;
							reader.readAsDataURL(item.file);
						});
						rows.push({
							name: item.file.name,
							kind: "image",
							dataUrl
						});
					} else throw new Error(tCodexExecution("attachmentPathUnavailable", langState.lang));
				}
				unchanged();
				const text = stripMentionArtifacts(original) || (rows.length ? tCodexExecution("attachmentTask", langState.lang) : "");
				await nativeCodex.submit({
					sessionId: key,
					cwd,
					text,
					attachments: rows,
					model: selection.model,
					reasoningEffort: selection.reasoningEffort
				});
				if (authority.inputStore.getSnapshot().draft === original) setComposerDraft(props, "");
				const consumed = new Set(attachments.map(codexAttachmentToken));
				setAttachItemsFor(key, codexAttachItems(key).filter((item) => !consumed.has(codexAttachmentToken(item))));
				for (const id of ids) props.inputActions?.removeAttachment?.(id);
				runtime.conversation?.releaseDraftAttachments?.(native);
				openNativeCodexView();
			} catch (error) {
				showToast(tCodexExecution("requestFailed", langState.lang));
			} finally {
				controller.nativePreparing = false;
				notifyCodexTurn();
			}
		}
		function wrapComposerSubmit(props) {
			const actions = props && props.inputActions;
			if (!actions || typeof actions.submit !== "function") return;
			actions.__apLatestProps = props;
			trackCodexTurnProps(props);
			const attachmentController = attachmentTurnControllers.get(attachmentTurnKey(props));
			if (attachmentController) attachmentController.latestProps = props;
			if (actions.__apFoldWrapped) return;
			const orig = actions.submit.bind(actions);
			actions.__apOrigSubmit = orig;
			actions.submit = () => {
				const live = actions.__apLatestProps || props;
				const before = currentDraft(live);
				const depthDraft = prepareDepthSubmission(live, before, nativeCodexAttachmentIds(live.input).length > 0 || codexAttachItems(attachmentTurnKey(live)).length > 0, langState.lang);
				if (depthDraft !== before) {
					fillComposer(live, depthDraft);
					requestAnimationFrame(() => actions.submit());
					return;
				}
				if (codexTurnArmed(live)) {
					submitCodexTurn(live);
					return;
				}
				const attachmentKey = attachmentTurnKey(live);
				if (attachmentTurnControllers.has(attachmentKey)) return;
				restoreCleanDraft(live);
				const sid = sessionHint(live) || runtime.sessionId || "active";
				const hasAttach = codexAttachItems(attachmentKey).length > 0;
				const hasKb = kbTaskOf(sid).slugs.length > 0 || hasKbTaskSelectionSave(sid);
				if (hasAttach) {
					submitAttachmentTurn(live);
					return;
				}
				if (hasKb && (stripMentionArtifacts(currentDraft(live)) || nativeCodexAttachmentIds(live.input).length)) {
					submitAttachmentTurn(live);
					return;
				}
				if (stripMentionArtifacts(before) !== before) {
					requestAnimationFrame(() => orig());
					return;
				}
				orig();
			};
			actions.__apFoldWrapped = true;
		}
		function dropNativeImages(files) {
			try {
				const dt = new DataTransfer();
				files.forEach((file) => dt.items.add(file));
				document.dispatchEvent(new DragEvent("drop", {
					bubbles: true,
					cancelable: true,
					dataTransfer: dt
				}));
				return true;
			} catch {
				return false;
			}
		}
		function nativeImageMime(file) {
			const type = String(file && file.type || "").toLowerCase();
			if (type === "image/png" || type === "image/jpeg" || type === "image/webp" || type === "image/gif") return type;
			const ext = String(file && file.name || "").split(".").pop().toLowerCase();
			if (ext === "png") return "image/png";
			if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
			if (ext === "webp") return "image/webp";
			if (ext === "gif") return "image/gif";
			return "";
		}
		async function asNativeImageFile(file) {
			if (!file) return null;
			const mime = nativeImageMime(file);
			if (mime) {
				if (mime === file.type) return file;
				const ext = mime === "image/jpeg" ? ".jpg" : "." + mime.slice(6);
				return new File([file], String(file.name || "image").replace(/\.[^.]+$/, ext), { type: mime });
			}
			try {
				const bitmap = await createImageBitmap(file);
				const canvas = document.createElement("canvas");
				canvas.width = bitmap.width;
				canvas.height = bitmap.height;
				canvas.getContext("2d").drawImage(bitmap, 0, 0);
				bitmap.close();
				const blob = await new Promise((resolveBlob) => canvas.toBlob(resolveBlob, "image/jpeg", .86));
				if (!blob) return null;
				return new File([blob], String(file.name || "image").replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
			} catch {
				return null;
			}
		}
		function addNativeImageFiles(props, files) {
			const list = (files || []).filter(Boolean);
			if (!list.length) return false;
			const result = addNativeComposerFiles({
				conversation: runtime.conversation,
				actions: props && props.inputActions,
				sessionId: resolveSessionId(props),
				files: list
			});
			if (result.status === "added") {
				showToast(list.length === 1 ? "已加入图片 " + list[0].name : "已加入 " + list.length + " 张图片");
				return true;
			}
			if (result.status === "rejected") {
				showToast("无法加入图片（可能超出张数或大小限制）");
				return false;
			}
			if (result.status === "error") {
				showToast(String(result.error && result.error.message || result.error));
				return false;
			}
			if (dropNativeImages(list)) {
				showToast(list.length === 1 ? "已加入图片 " + list[0].name : "已加入 " + list.length + " 张图片");
				return true;
			}
			showToast("图片未能加入输入框，请把图片直接拖到输入框重试。");
			return false;
		}
		async function attachNativeImages(props, imageFiles) {
			const native = [];
			for (const file of imageFiles || []) {
				const converted = await asNativeImageFile(file);
				if (converted) native.push(converted);
				else showToast("不支持的图片格式：" + (file && file.name || "image"));
			}
			if (native.length) addNativeImageFiles(props, native);
			return native.length;
		}
		function snapshotFileList(fileList) {
			return Array.from(fileList || []);
		}
		function attachDiskPaths(props, paths, source) {
			const items = (paths || []).filter(Boolean).map((path) => {
				const name = folderNameOf(path);
				return {
					id: path + ":" + Date.now() + ":" + Math.random().toString(36).slice(2, 7),
					relativePath: String(path).replace(/\\/g, "/"),
					path,
					name,
					kind: fileKind(name),
					loaded: true
				};
			});
			attachItemsToComposer(snapshotComposer(), items, source || "upload");
		}
		function mergeImportedItems(props, imported) {
			const sid = resolveSessionId(props) || resolveSessionId(composerPropsRef.current) || runtime.sessionId || "pending";
			const current = attachItemsOf(sid).slice();
			for (const item of imported || []) {
				const idx = current.findIndex((row) => row.name === item.name && row.kind === item.kind);
				if (idx >= 0) {
					const stableId = current[idx].id;
					current[idx] = Object.assign({}, current[idx], item);
					if (stableId) current[idx].id = stableId;
				} else if (!current.some((row) => attachKey(row) === attachKey(item))) current.push(item);
			}
			setAttachItemsFor(sid, current);
		}
		async function uploadFileList(cwd, fileList, props) {
			const files = snapshotFileList(fileList);
			if (!files.length) {
				showToast("没有选中文件");
				return 0;
			}
			attachItemsToComposer(snapshotComposer(), files.map((file) => ({
				id: (file.webkitRelativePath || file.name) + ":" + Date.now() + ":" + Math.random().toString(36).slice(2, 7),
				relativePath: String(file.webkitRelativePath || file.name).replace(/\\/g, "/"),
				path: "",
				name: file.name,
				kind: fileKind(file.name, file.type),
				previewUrl: fileKind(file.name, file.type) === "image" ? URL.createObjectURL(file) : "",
				uploaded: false,
				loaded: true,
				size: file.size,
				file
			})), "upload");
			if (!cwd) return files.length;
			const items = [];
			const imageFiles = [];
			for (const file of files) {
				const rel = file.webkitRelativePath || file.name;
				try {
					const saved = await uploadBytes(cwd, rel, file);
					const relativePath = (saved && saved.relativePath || "Agent Pi Uploads/" + String(rel).replace(/\\/g, "/")).replace(/\\/g, "/");
					const kind = fileKind(file.name, file.type);
					items.push({
						id: relativePath + ":" + Date.now() + ":" + Math.random().toString(36).slice(2, 7),
						relativePath,
						path: saved && saved.path,
						name: file.name,
						kind,
						previewUrl: kind === "image" ? URL.createObjectURL(file) : "",
						uploaded: true,
						loaded: true,
						size: file.size,
						cwd,
						sessionId: resolveSessionId(props)
					});
					if (kind === "image") imageFiles.push(file);
				} catch (err) {
					showToast("已加入对话，但未能写入工作区：" + String(err && err.message || err));
				}
			}
			if (items.length) mergeImportedItems(snapshotComposer(), items);
			if (imageFiles.length) attachNativeImages(snapshotComposer(), imageFiles).catch((err) => showToast(String(err && err.message || err)));
			window.dispatchEvent(new Event("agent-pi-files-changed"));
			return files.length;
		}
		async function importDiskPaths(cwd, paths, props) {
			if (!cwd) return 0;
			const list = (paths || []).filter(Boolean);
			if (!list.length) return 0;
			const files = (await api("/api/agent-pi/files/import", cwd, {
				method: "POST",
				body: JSON.stringify({ paths: list })
			})).files || [];
			if (!files.length) return 0;
			mergeImportedItems(props, files.map((file) => {
				const name = file.name || String(file.relativePath || "").split(/[\\/]/).pop();
				const kind = fileKind(name);
				return {
					id: (file.relativePath || name) + ":" + Date.now() + ":" + Math.random().toString(36).slice(2, 7),
					relativePath: String(file.relativePath || "").replace(/\\/g, "/"),
					path: file.path,
					name,
					kind,
					cwd,
					sessionId: resolveSessionId(props),
					previewUrl: kind === "image" && file.path ? `/api/agent-pi/files/raw?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(file.path)}` : "",
					uploaded: true,
					loaded: true,
					size: file.size
				};
			}));
			window.dispatchEvent(new Event("agent-pi-files-changed"));
			return files.length;
		}
		async function chooseAndUpload(cwd, props, mode, inputs) {
			const live = snapshotComposer();
			if (mode === "folder") {
				await chooseFolderForChat(cwd, live);
				return;
			}
			const desktop = desktopApi();
			try {
				if (desktop && typeof desktop.pickFiles === "function") {
					const paths = normalizePickedPaths(await desktop.pickFiles());
					if (!paths.length) return;
					attachDiskPaths(live, paths, "upload");
					if (cwd) importDiskPaths(cwd, paths, live).catch((err) => {
						showToast("文件已加入对话，但未能拷进工作区：" + String(err && err.message || err));
					});
					return;
				}
			} catch (err) {
				showToast("选择文件失败：" + String(err && err.message || err));
				return;
			}
			const input = inputs && inputs.fileInput;
			if (input && input.current) input.current.click();
			else showToast(tAp("files.pickerUnavailable"));
		}
		function attachFolderPath(props, dir) {
			const path = String(dir || "").trim();
			if (!path) return;
			const name = folderNameOf(path);
			attachItemsToComposer(snapshotComposer(), [{
				id: "folder:" + path + ":" + Date.now(),
				relativePath: path,
				path,
				name,
				kind: "folder"
			}], "folder");
		}
		async function chooseFolderForChat(_cwd, props) {
			const live = snapshotComposer();
			const desktop = desktopApi();
			if (desktop && typeof desktop.pickFolder === "function") try {
				const dir = await desktop.pickFolder();
				if (dir) attachFolderPath(live, dir);
				return;
			} catch (err) {
				showToast("选择文件夹失败：" + String(err && err.message || err));
			}
			const input = document.createElement("input");
			input.type = "file";
			input.setAttribute("webkitdirectory", "");
			input.setAttribute("directory", "");
			input.multiple = true;
			input.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none";
			input.addEventListener("change", () => {
				const files = snapshotFileList(input.files);
				input.remove();
				if (!files.length) return;
				attachFolderPath(live, String(files[0].webkitRelativePath || files[0].name).split(/[\\/]/)[0] || "folder");
			});
			document.body.appendChild(input);
			input.click();
		}
		function mentionInChat(props, file) {
			if (file && file.type === "directory") {
				attachFolderPath(props, file.path || file.relativePath);
				return;
			}
			const rel = (file.relativePath || file.path || "").replace(/\\/g, "/");
			const name = file.name || rel.split(/[\\/]/).pop() || rel;
			const items = [{
				id: rel + ":" + Date.now(),
				relativePath: rel,
				path: file.path,
				name,
				kind: fileKind(name),
				previewUrl: filePreviewUrl(props, file),
				size: file.size
			}];
			stripComposerMentions([{
				relativePath: rel,
				path: file.path,
				name
			}]);
			attachItemsToComposer(snapshotComposer(), items, "mention");
		}
		function FileContextMenu(props) {
			const menu = props.menu;
			react.useEffect(() => {
				if (!menu) return void 0;
				let armed = false;
				const arm = window.setTimeout(() => {
					armed = true;
				}, 280);
				const close = (event) => {
					if (!armed || event && event.button === 2) return;
					const node = event && event.target;
					if (node && node.closest && node.closest(".ap-menu")) return;
					props.onClose();
				};
				window.addEventListener("pointerdown", close, true);
				return () => {
					window.clearTimeout(arm);
					window.removeEventListener("pointerdown", close, true);
				};
			}, [
				menu && menu.x,
				menu && menu.y,
				menu && menu.file
			]);
			if (!menu) return null;
			const node = h("div", {
				className: "ap-menu",
				style: {
					left: menu.x + "px",
					top: menu.y + "px"
				},
				onClick: (e) => e.stopPropagation(),
				onContextMenu: (e) => e.stopPropagation()
			}, props.children);
			if (react_dom && typeof react_dom.createPortal === "function") return react_dom.createPortal(node, document.body);
			return node;
		}
		function readReasoningEffort() {
			const label = readComposerModelLabel();
			if (/\bmax\b/i.test(label)) return "max";
			if (/\bhigh\b/i.test(label)) return "high";
			if (/\bmedium\b/i.test(label)) return "medium";
			if (/\blow\b/i.test(label)) return "low";
		}
		function readComposerModelLabel() {
			const seat = document.querySelector("[data-slot=\"conversation.input.model\"]");
			return seat ? String(seat.textContent || "").replace(/\s+/g, " ").trim() : "";
		}
		function sourceLabel(source) {
			if (source === "official-output") return langState.lang === "zh" ? "正式" : "Official";
			if (source === "attachment") return langState.lang === "zh" ? "上传" : "Upload";
			if (source === "tender-workspace") return langState.lang === "zh" ? "项目" : "Project";
			return null;
		}
		function displayFileName(file) {
			if (file.source === "official-output" && (file.name === "Official Outputs" || file.name === "工作成果")) return tAp("files.officialName");
			if (file.source === "attachment" && (file.name === "上传资料" || file.name === "Agent Pi Uploads")) return tAp("files.uploads");
			return file.name;
		}
		function formatKbBytes(n) {
			const value = Number(n) || 0;
			if (value < 1024) return value + " B";
			if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
			return (value / (1024 * 1024)).toFixed(1) + " MB";
		}
		function importWorkspaceFileToKb(cwd, file, props) {
			const packLike = looksLikeKbPackName(file);
			if (!file || file.type === "directory" && !packLike) {
				showToast("请选文件，或选含 pack.json 的知识包文件夹");
				return Promise.resolve();
			}
			const path = String(file.path || "").trim();
			if (!path) {
				showToast("这个文件没有磁盘路径");
				return Promise.resolve();
			}
			const sessionId = resolveSessionId(props) || runtime.sessionId || "active";
			return api("/api/agent-pi/kb", cwd, {
				method: "POST",
				body: JSON.stringify({
					action: packLike ? "import-pack" : "stage",
					path,
					sessionId,
					category: looksLikeUserTemplateName(file.name || path) ? "用户模板" : "规范"
				})
			}).then((staged) => {
				const slug = staged && staged.entry && staged.entry.slug;
				if (!slug) throw new Error("落入知识库失败");
				if (staged.entry && staged.entry.parseStatus === "ready") {
					const asTemplate = staged.entry.category === "用户模板" || staged.entry.category === "用户模版";
					showToast((packLike ? "知识包已入库：" : asTemplate ? "已加入知识库（用户模板）：" : "已加入知识库：") + (file.name || slug));
					window.dispatchEvent(new CustomEvent("agent-pi-kb-changed"));
					return;
				}
				return api("/api/agent-pi/kb", cwd, {
					method: "POST",
					body: JSON.stringify({
						action: "parse",
						slug,
						sessionId
					})
				}).then(() => {
					showToast("已加入知识库并开始解析：" + (file.name || slug));
					window.dispatchEvent(new CustomEvent("agent-pi-kb-changed"));
				});
			}).catch((err) => {
				showToast("导入知识库失败：" + String(err && err.message || err));
			});
		}
		function kbTitle(entry) {
			const base = String(entry && (entry.title || entry.originalName || entry.name) || "").replace(/^.*[\\/]/, "");
			if (!base || /^full\.md$/i.test(base)) return base || entry && entry.slug || "文档";
			return base.replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "") || base;
		}
		function statusChip(status) {
			if (status === "blocked") return h("span", { className: "ap-chip warn" }, workbenchText("门禁未过"));
			if (status === "done") return h("span", { className: "ap-chip ok" }, workbenchText("已完成"));
			if (status === "running") return h("span", { className: "ap-chip live" }, workbenchText("进行中"));
			return null;
		}
		function FilePickPanel(props) {
			const cwd = props.cwd;
			const selected = props.selected || [];
			const [nodes, setNodes] = react.useState([]);
			const [extra, setExtra] = react.useState("");
			const selectedSet = react.useMemo(() => new Set(selected), [selected]);
			react.useEffect(() => {
				if (!cwd) return;
				api("/api/agent-pi/files", cwd, { method: "GET" }).then((body) => setNodes(body.files || [])).catch(() => setNodes([]));
			}, [cwd]);
			const expand = (node) => {
				if (node.type !== "directory") return;
				api("/api/agent-pi/files?parentPath=" + encodeURIComponent(node.path), cwd, { method: "GET" }).then((body) => setNodes((current) => replaceChildren(current, node.path, body.files || []))).catch(() => {});
			};
			const renderNode = (node, depth) => {
				const on = selectedSet.has(node.path);
				return h("div", { key: node.path }, h("button", {
					type: "button",
					className: "ap-tree-btn" + (on ? " on" : ""),
					style: { paddingLeft: 6 + depth * 10 },
					onClick: () => {
						if (node.type === "directory") expand(node);
						else props.onToggle(node.path, node.name);
					}
				}, Icon(node.type === "directory" ? "folder" : "file", 13), h("span", {
					className: "ap-tree-name",
					title: node.path
				}, node.name), node.type !== "directory" && on ? h("span", { className: "ap-chip ok" }, "已选") : null), node.children && node.children.length ? h("div", { className: "ap-tree-kids" }, node.children.map((child) => renderNode(child, depth + 1))) : null);
			};
			const desktop = desktopApi();
			return h("div", null, h("p", { className: "ap-sub" }, "只登记本次明确选择的文件。系统不会把项目工作目录自动当作资料库扫描。"), h("p", { className: "ap-sub" }, "可同时附企业工效表（文件名含「工效 / productivity / 日产」）。有企业工效时优先于网络调研；组价稿里改过的工效和关键资源价，保存确认后落成该项目人工复核准确数并全局重算数量。"), h("div", {
				className: "ap-row",
				style: { margin: "8px 0" }
			}, desktop && typeof desktop.pickFiles === "function" ? h("button", {
				type: "button",
				className: "ap-btn",
				onClick: () => {
					desktop.pickFiles().then((paths) => {
						normalizePickedPaths(paths).forEach((path) => props.onToggle(path, fileName(path), true));
					});
				}
			}, Icon("filePlus", 14), "添加依据和待分析文件") : null), h("div", { className: "ap-tree-pick" }, nodes.length ? nodes.map((node) => renderNode(node, 0)) : h("div", { className: "ap-files-empty" }, "工作区内暂无可选文件")), h("label", null, "或粘贴绝对路径（每行一个）"), h("input", {
				value: extra,
				placeholder: "C:\\\\path\\\\to\\\\file.pdf",
				onChange: (e) => setExtra(e.target.value),
				onKeyDown: (e) => {
					if (e.key === "Enter" && extra.trim()) {
						extra.split(/\n+/).map((s) => s.trim()).filter(Boolean).forEach((path) => props.onToggle(path, fileName(path), true));
						setExtra("");
					}
				}
			}), selected.length ? h("div", { style: { marginTop: 8 } }, selected.map((path) => h("div", {
				className: "ap-file-item",
				key: path
			}, h("span", { title: path }, fileName(path)), h("button", {
				type: "button",
				className: "ap-btn ghost",
				onClick: () => props.onToggle(path)
			}, "移除")))) : h("p", { className: "ap-sub" }, "可暂不添加，进入项目后继续上传。"));
		}
		const { KnowledgeBasePanel, formatKbTaskBlock, kbTaskOf, claimDraftKbTask, flushKbTaskSelection, hasKbTaskSelectionSave, resetDraftKbTask, kbDraftKey } = createKnowledgeBasePanel({
			Icon,
			KB_PRESET_CATEGORIES,
			React: react,
			apJoin,
			api,
			apiBlob,
			desktopApi,
			diskPathOf,
			downloadBlob,
			ensureKbFileInput,
			fileIconClass,
			fileIconName,
			fileName,
			formatKbBytes,
			groupKbEntries,
			h,
			kbCategoryHint,
			kbCategoryLabel,
			kbChatImportCopy,
			kbFidelityLabel,
			kbIngestKind,
			kbIngestLabel,
			kbLandingCardVisible,
			kbPickPatch,
			kbPickState,
			kbPickUpsert,
			kbProgressText,
			kbTitle,
			mergeKbEntries,
			normalizePickedPaths,
			parkKbFileInput,
			resolveSessionId,
			runtime,
			sortKbCategories,
			tAp,
			uploadKbBytes,
			useApLang
		});
		function joinSlugs(value) {
			return Array.isArray(value) ? value.filter(Boolean).join(", ") : "";
		}
		function splitSlugs(value) {
			return String(value || "").split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
		}
		function blankStage(index) {
			return {
				id: "stage-" + String(index + 1),
				label: "",
				labelZh: tAp("mm.stageN", { n: index + 1 }),
				hintZh: "",
				prompt: "",
				skillSlugs: "",
				reviewSkillSlugs: "",
				reviewPolicy: "risk-based",
				approvalEnabled: false,
				approvalPrompt: "",
				approveLabel: tAp("kb.confirmOk"),
				rejectLabel: "",
				listsSources: false,
				binding: "",
				summaryFile: "",
				summaryOutline: ""
			};
		}
		function workflowToDraft(row) {
			const workflow = row && row.workflow || {};
			const binding = workflow.bindingAreaByStage || {};
			const stages = Array.isArray(workflow.stages) ? workflow.stages : [];
			return {
				id: row.id,
				revision: row.revision,
				label: workflow.label || row.label || "",
				labelZh: workflow.labelZh || row.labelZh || moduleLabel(row),
				icon: row.icon || "",
				controlProfile: workflow.controlProfile || "",
				setupStageId: workflow.setupStageId || "",
				kbPack: {
					analysis: (workflow.kbPack && workflow.kbPack.analysis || []).slice(),
					pricing: (workflow.kbPack && workflow.kbPack.pricing || []).slice(),
					planning: (workflow.kbPack && workflow.kbPack.planning || []).slice()
				},
				useOwnKbPack: Boolean(workflow.kbPack),
				stages: stages.map((stage, index) => ({
					id: stage.id || "stage-" + (index + 1),
					label: stage.label || "",
					labelZh: stage.labelZh || stage.label || "",
					hintZh: stage.hintZh || "",
					prompt: stage.prompt || "",
					skillSlugs: joinSlugs(stage.skillSlugs),
					consumes: Array.isArray(stage.consumes) ? stage.consumes.map((item) => ({ ...item })) : void 0,
					reviewSkillSlugs: joinSlugs(stage.reviewSkillSlugs),
					reviewPolicy: stage.reviewPolicy || "risk-based",
					approvalEnabled: !!stage.approvalGate,
					approvalPrompt: stage.approvalGate && stage.approvalGate.promptZh || "",
					approveLabel: stage.approvalGate && stage.approvalGate.approveLabelZh || "确认并继续",
					rejectLabel: stage.approvalGate && stage.approvalGate.rejectLabelZh || "",
					listsSources: !!stage.listsSources,
					binding: binding[stage.id] || "",
					summaryFile: stage.summaryDeliverable && stage.summaryDeliverable.fileName || "",
					summaryOutline: (stage.summaryDeliverable && stage.summaryDeliverable.outlineZh || []).join("\n")
				}))
			};
		}
		function draftToDefinition(draft) {
			const bindingAreaByStage = {};
			const stages = (draft.stages || []).map((stage) => {
				const id = String(stage.id || "").trim();
				if (stage.binding === "analysis" || stage.binding === "pricing" || stage.binding === "planning") bindingAreaByStage[id] = stage.binding;
				const outline = String(stage.summaryOutline || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
				const fileName = String(stage.summaryFile || "").trim();
				return {
					id,
					label: String(stage.label || "").trim() || void 0,
					labelZh: String(stage.labelZh || "").trim(),
					hintZh: String(stage.hintZh || "").trim() || void 0,
					prompt: String(stage.prompt || "").trim(),
					skillSlugs: splitSlugs(stage.skillSlugs),
					consumes: Array.isArray(stage.consumes) ? stage.consumes.map((item) => ({ ...item })) : void 0,
					reviewSkillSlugs: splitSlugs(stage.reviewSkillSlugs),
					reviewPolicy: stage.reviewPolicy === "all" ? "all" : "risk-based",
					approvalGate: stage.approvalEnabled ? {
						promptZh: String(stage.approvalPrompt || "").trim(),
						approveLabelZh: String(stage.approveLabel || "").trim(),
						rejectLabelZh: String(stage.rejectLabel || "").trim() || void 0
					} : void 0,
					listsSources: stage.listsSources ? true : void 0,
					summaryDeliverable: fileName ? {
						fileName,
						outlineZh: outline
					} : void 0
				};
			});
			return {
				schemaVersion: 1,
				id: draft.id,
				label: String(draft.label || "").trim() || void 0,
				labelZh: String(draft.labelZh || "").trim(),
				icon: String(draft.icon || "").trim() || void 0,
				controlProfile: draft.controlProfile === "tender" ? "tender" : void 0,
				setupStageId: draft.setupStageId || void 0,
				bindingAreaByStage: Object.keys(bindingAreaByStage).length ? bindingAreaByStage : void 0,
				kbPack: function pack() {
					const next = {
						analysis: draft.kbPack && draft.kbPack.analysis || [],
						pricing: draft.kbPack && draft.kbPack.pricing || [],
						planning: draft.kbPack && draft.kbPack.planning || []
					};
					const any = next.analysis.length + next.pricing.length + next.planning.length;
					if (draft.useOwnKbPack || any > 0) return next;
				}(),
				stages
			};
		}
		function ModuleManagerPanel(props) {
			useApLang();
			const cwd = props.cwd || "";
			const [rows, setRows] = react.useState([]);
			const [errors, setErrors] = react.useState([]);
			const [error, setError] = react.useState("");
			const [notice, setNotice] = react.useState("");
			const [busy, setBusy] = react.useState("");
			const [importText, setImportText] = react.useState("");
			const [viewingId, setViewingId] = react.useState("");
			const [copying, setCopying] = react.useState(null);
			const [copyId, setCopyId] = react.useState("");
			const [copyLabel, setCopyLabel] = react.useState("");
			const [copyThenEdit, setCopyThenEdit] = react.useState(false);
			const [editing, setEditing] = react.useState(null);
			const [kbEntries, setKbEntries] = react.useState([]);
			const createCopy = moduleCreateCopy();
			const load = react.useCallback(() => {
				return api("/api/agent-pi/modules", cwd, { method: "GET" }).then((body) => {
					setRows(body.modules || []);
					setErrors(body.errors || []);
					setError("");
				}).catch((e) => setError(String(e.message || e)));
			}, [cwd]);
			react.useEffect(() => {
				load();
			}, [load]);
			react.useEffect(() => {
				if (!editing) return;
				api("/api/agent-pi/kb", cwd, { method: "GET" }).then((body) => setKbEntries(body && body.entries || [])).catch(() => setKbEntries([]));
			}, [editing ? editing.id : "", cwd]);
			const act = (busyKey, body, done) => {
				setBusy(busyKey);
				setError("");
				setNotice("");
				return api("/api/agent-pi/modules", cwd, {
					method: "POST",
					body: JSON.stringify(body)
				}).then((result) => {
					if (done) done(result);
					return load();
				}).then(() => {
					if (props.onChanged) props.onChanged();
				}).catch((e) => setError(String(e.message || e))).finally(() => setBusy(""));
			};
			const toggle = (row) => act("sw:" + row.id, {
				action: "set_enabled",
				id: row.id,
				disabled: !row.disabled
			}, () => setNotice(tAp(row.disabled ? "mm.enabled" : "mm.disabled", { name: moduleLabel(row) })));
			const remove = (row) => {
				if (!window.confirm(tAp("mm.deleteConfirm", { name: moduleLabel(row) }))) return;
				act("rm:" + row.id, {
					action: "remove",
					id: row.id
				}, () => setNotice(tAp("mm.deleted", { id: row.id })));
			};
			const importSave = () => {
				let parsed;
				try {
					parsed = JSON.parse(importText);
				} catch (e) {
					setError(tAp("mm.jsonFail", { err: String(e.message || e) }));
					return;
				}
				act("import", {
					action: "save",
					definition: parsed
				}, (saved) => {
					setNotice(tAp("mm.installed", { id: saved && saved.id ? saved.id : "" }));
					setImportText("");
					if (saved && saved.id && props.onOpened) props.onOpened(saved.id);
				});
			};
			const suggestCopyId = (sourceId) => {
				const taken = new Set(rows.map((item) => item.id));
				const root = String(sourceId || "").slice(0, 24);
				const first = root + "-copy";
				if (!taken.has(first)) return first;
				for (let n = 2; n < 40; n++) {
					const id = root + "-copy-" + n;
					if (!taken.has(id)) return id;
				}
				return first;
			};
			const beginCopy = (row, thenEdit) => {
				setCopyThenEdit(!!thenEdit);
				setCopying(row);
				setCopyId(suggestCopyId(row.id));
				setCopyLabel(moduleLabel(row) + tAp("mm.copySuffix"));
				setEditing(null);
			};
			const submitCopy = () => {
				if (!copying) return;
				const openEditor = copyThenEdit;
				act("copy", {
					action: "copy",
					id: copying.id,
					newId: copyId.trim(),
					labelZh: copyLabel.trim()
				}, (saved) => {
					setNotice(tAp("mm.copied", { id: saved && saved.id ? saved.id : "" }));
					setCopying(null);
					setCopyThenEdit(false);
					if (openEditor && saved) {
						setEditing(workflowToDraft(saved));
						setViewingId("");
					} else if (saved && saved.id && props.onOpened) props.onOpened(saved.id);
					else setViewingId(saved && saved.id ? saved.id : "");
				});
			};
			const patchDraft = (patch) => setEditing((current) => current ? Object.assign({}, current, patch) : current);
			const patchStage = (index, patch) => setEditing((current) => current ? patchWorkflowStage(current, index, patch) : current);
			const moveStage = (index, delta) => {
				const next = moveWorkflowStage(editing, index, delta);
				const issue = workflowDependencyError(next.stages);
				if (issue) {
					setError(tAp("mm.dependencyError", issue));
					return;
				}
				setError("");
				setEditing(next);
			};
			const addStage = () => setEditing((current) => {
				if (!current || current.stages.length >= 12) return current;
				const stage = {
					...blankStage(current.stages.length),
					id: nextStageId(current.stages),
					consumes: []
				};
				return {
					...current,
					stages: current.stages.concat([stage])
				};
			});
			const removeStage = (index) => {
				const dependents = stageDependents(editing, editing.stages[index].id);
				if (dependents.length) {
					setError(tAp("mm.removeDependency", { stages: dependents.map((stage) => stage.labelZh || stage.id).join(", ") }));
					return;
				}
				setError("");
				setEditing(removeWorkflowStage(editing, index));
			};
			const beginCreate = () => {
				const taken = new Set(rows.map((row) => row.id));
				let n = 1;
				while (taken.has("my-workflow-" + n)) n++;
				const stage = {
					...blankStage(0),
					consumes: []
				};
				setEditing({
					id: "my-workflow-" + n,
					isNew: true,
					label: "",
					labelZh: "",
					icon: "",
					controlProfile: "",
					setupStageId: "",
					kbPack: {
						analysis: [],
						pricing: [],
						planning: []
					},
					useOwnKbPack: true,
					stages: [stage]
				});
				setCopying(null);
				setViewingId("");
				setError("");
				setNotice("");
			};
			const beginEdit = (row) => {
				if (row.builtin) {
					setNotice(tAp("mm.builtinLocked"));
					beginCopy(row, true);
					return;
				}
				setEditing(workflowToDraft(row));
				setCopying(null);
				setViewingId("");
			};
			const toggleKb = (area, slug, on) => setEditing((current) => {
				if (!current) return current;
				const pack = Object.assign({
					analysis: [],
					pricing: [],
					planning: []
				}, current.kbPack);
				const list = (pack[area] || []).filter((item) => item !== slug);
				if (on) list.push(slug);
				pack[area] = list;
				return Object.assign({}, current, {
					kbPack: pack,
					useOwnKbPack: true
				});
			});
			const saveEdit = () => {
				if (!editing) return;
				const issue = workflowDependencyError(editing.stages);
				if (issue) {
					setError(tAp("mm.dependencyError", issue));
					return;
				}
				if (!window.confirm(tAp("mm.saveConfirm"))) return;
				act("edit", {
					action: "save",
					definition: draftToDefinition(editing),
					createOnly: !!editing.isNew,
					expectedRevision: editing.revision
				}, (saved) => {
					setNotice(tAp("mm.saved", { id: saved && saved.id ? saved.id : "" }));
					setEditing(null);
					if (saved && saved.id && props.onOpened) props.onOpened(saved.id);
					else setViewingId(saved && saved.id ? saved.id : "");
				});
			};
			const stageMarks = (stage) => {
				const marks = [];
				if (stage.listsSources) marks.push(tAp("mm.markLists"));
				if (stage.summaryDeliverable && stage.summaryDeliverable.fileName) marks.push(tAp("mm.markSummary", { name: stage.summaryDeliverable.fileName }));
				if (stage.skillSlugs && stage.skillSlugs.length) marks.push(tAp("mm.markSkills", { list: apJoin(stage.skillSlugs) }));
				if (stage.reviewSkillSlugs && stage.reviewSkillSlugs.length) marks.push(tAp("mm.markReview", { list: apJoin(stage.reviewSkillSlugs) }));
				return marks.join(" · ");
			};
			return h("div", {
				className: "ap-ov",
				style: {
					display: "block",
					overflow: "auto"
				}
			}, h("div", {
				className: "ap-ov-main",
				style: {
					maxWidth: 1080,
					margin: "0 auto"
				}
			}, h("header", { className: "ap-ov-hd" }, h("div", { style: { minWidth: 0 } }, h("h1", null, tAp("mm.title")), h("div", { className: "ap-sub" }, tAp("mm.lead")), h("div", {
				className: "ap-sub",
				style: { marginTop: 4 }
			}, tAp("mm.lead2"))), h("div", { className: "ap-actions" }, h("button", {
				type: "button",
				className: "ap-btn primary",
				onClick: beginCreate
			}, Icon("plus", 14), tAp("mm.newWorkflow")), h("button", {
				type: "button",
				className: "ap-btn",
				onClick: () => load()
			}, Icon("refresh", 14), tAp("kb.refresh")), h("button", {
				type: "button",
				className: "ap-btn primary",
				title: tAp("mm.designTitle"),
				onClick: () => props.onDesign && props.onDesign("custom-steps")
			}, Icon("sparkles", 14), tAp("mm.design")))), error ? h("div", { className: "ap-err" }, error) : null, notice ? h("div", {
				className: "ap-sub",
				style: { padding: "6px 0" }
			}, notice) : null, h("details", { className: "ap-sec" }, h("summary", { style: { cursor: "pointer" } }, createCopy.title), h("div", { className: "ap-create-lead" }, h("strong", null, tAp("mm.packNotJson")), h("p", {
				className: "ap-sub",
				style: { margin: 0 }
			}, createCopy.lead), h("p", {
				className: "ap-sub",
				style: { margin: "6px 0 0" }
			}, createCopy.warn)), h("p", {
				className: "ap-sub",
				style: { marginTop: 10 }
			}, tAp("mm.pickKind")), h("div", { className: "ap-create-picks" }, createCopy.cards.map((card) => h("button", {
				key: card.id,
				type: "button",
				className: "ap-create-pick",
				onClick: () => props.onDesign && props.onDesign(card.id)
			}, h("strong", null, card.title), h("span", null, card.body)))), h("details", { style: { marginTop: 14 } }, h("summary", {
				className: "ap-sub",
				style: { cursor: "pointer" }
			}, tAp("mm.advanced")), h("p", {
				className: "ap-sub",
				style: { marginTop: 8 }
			}, createCopy.advanced), h("textarea", {
				value: importText,
				spellCheck: false,
				onChange: (e) => setImportText(e.target.value),
				style: {
					width: "100%",
					minHeight: 140,
					marginTop: 8,
					padding: "10px 12px",
					boxSizing: "border-box",
					borderRadius: 8,
					border: "1px solid var(--dsw-border, rgba(127,127,127,.35))",
					background: "transparent",
					color: "inherit",
					font: "var(--dsw-font-markdown-code-block-small)"
				}
			}), h("div", {
				className: "ap-row",
				style: {
					justifyContent: "flex-end",
					gap: 8,
					marginTop: 8
				}
			}, h("button", {
				type: "button",
				className: "ap-btn primary",
				disabled: busy === "import" || !importText.trim(),
				onClick: importSave
			}, busy === "import" ? tAp("mm.installing") : tAp("mm.install"))))), copying ? h("section", { className: "ap-sec" }, h("h2", null, tAp("mm.copyTitle")), h("p", { className: "ap-sub" }, tAp("mm.copyLead", { name: moduleLabel(copying) })), h("label", {
				className: "ap-sub",
				style: {
					display: "block",
					marginTop: 10
				}
			}, tAp("mm.labelZh")), h("input", {
				value: copyLabel,
				onChange: (e) => setCopyLabel(e.target.value),
				style: {
					width: "100%",
					marginTop: 4,
					padding: "8px 10px",
					boxSizing: "border-box",
					borderRadius: 8,
					border: "1px solid var(--dsw-border, rgba(127,127,127,.35))",
					background: "transparent",
					color: "inherit"
				}
			}), h("label", {
				className: "ap-sub",
				style: {
					display: "block",
					marginTop: 10
				}
			}, tAp("mm.moduleId")), h("input", {
				value: copyId,
				onChange: (e) => setCopyId(e.target.value),
				style: {
					width: "100%",
					marginTop: 4,
					padding: "8px 10px",
					boxSizing: "border-box",
					borderRadius: 8,
					border: "1px solid var(--dsw-border, rgba(127,127,127,.35))",
					background: "transparent",
					color: "inherit"
				}
			}), h("div", {
				className: "ap-row",
				style: {
					justifyContent: "flex-end",
					gap: 8,
					marginTop: 8
				}
			}, h("button", {
				type: "button",
				className: "ap-btn",
				onClick: () => setCopying(null)
			}, tAp("mm.cancel")), h("button", {
				type: "button",
				className: "ap-btn primary",
				disabled: busy === "copy" || !copyId.trim() || !copyLabel.trim(),
				onClick: submitCopy
			}, busy === "copy" ? tAp("mm.copying") : copyThenEdit ? tAp("mm.copyOpen") : tAp("mm.copyLive")))) : null, editing ? h("section", { className: "ap-sec" }, h("h2", null, tAp("mm.editTitle", { name: editing.labelZh || editing.id })), h("p", { className: "ap-sub" }, tAp("mm.editLead")), editing.isNew ? h("label", { className: "ap-mm-field" }, tAp("mm.moduleId"), h("input", {
				value: editing.id,
				onChange: (e) => patchDraft({ id: e.target.value })
			})) : null, h("label", { className: "ap-mm-field" }, tAp("mm.labelZh"), h("input", {
				value: editing.labelZh,
				onChange: (e) => patchDraft({ labelZh: e.target.value })
			})), h("label", { className: "ap-mm-field" }, tAp("mm.labelEn"), h("input", {
				value: editing.label,
				onChange: (e) => patchDraft({ label: e.target.value })
			})), h("label", { className: "ap-mm-field" }, tAp("mm.controlProfile"), h("select", {
				value: editing.controlProfile,
				onChange: (e) => {
					if (e.target.value === "" && editing.controlProfile === "tender") {
						if (!window.confirm(tAp("mm.freeWorkflowConfirm"))) return;
						patchDraft({
							controlProfile: "",
							stages: editing.stages.map((stage) => ({
								...stage,
								consumes: (stage.consumes || []).filter((item) => item.kind !== "capability")
							}))
						});
					} else patchDraft({ controlProfile: e.target.value });
				}
			}, h("option", { value: "" }, tAp("mm.freeWorkflow")), editing.controlProfile === "tender" ? h("option", { value: "tender" }, tAp("mm.tenderControls")) : null)), h("label", { className: "ap-mm-field" }, tAp("mm.setupStage"), h("select", {
				value: editing.setupStageId,
				onChange: (e) => patchDraft({ setupStageId: e.target.value })
			}, h("option", { value: "" }, tAp("mm.noSetupStage")), editing.stages.map((stage) => h("option", {
				key: stage.id,
				value: stage.id
			}, (stage.labelZh || stage.id) + " · " + stage.id)))), h("div", { className: "ap-mm-ed-stage" }, h("strong", null, tAp("mm.kbPack")), h("p", { className: "ap-sub" }, tAp("mm.kbPackLead")), h("div", { className: "ap-mm-checks" }, h("label", null, h("input", {
				type: "checkbox",
				checked: !!editing.useOwnKbPack,
				onChange: (e) => patchDraft({ useOwnKbPack: e.target.checked })
			}), " " + tAp("mm.kbOwnOnly"))), kbEntries.length === 0 ? h("p", { className: "ap-sub" }, tAp("mm.kbEmpty")) : [
				"analysis",
				"pricing",
				"planning"
			].map((area) => {
				const selected = editing.kbPack && editing.kbPack[area] || [];
				return h("div", {
					key: area,
					style: { marginTop: 10 }
				}, h("div", { className: "ap-sub" }, tAp("mm.area." + area)), kbEntries.map((entry) => h("label", {
					key: area + ":" + entry.slug,
					className: "ap-mm-checks",
					style: { marginTop: 4 }
				}, h("input", {
					type: "checkbox",
					checked: selected.indexOf(entry.slug) >= 0,
					onChange: (e) => toggleKb(area, entry.slug, e.target.checked)
				}), " " + (typeof kbTitle === "function" ? kbTitle(entry) : entry.name) + (entry.category ? " · " + kbCategoryLabel(entry.category) : ""))));
			})), editing.stages.map((stage, index) => h("div", {
				key: index,
				className: "ap-mm-ed-stage"
			}, h("div", {
				className: "ap-row",
				style: {
					gap: 8,
					justifyContent: "space-between"
				}
			}, h("strong", null, tAp("mm.stageN", { n: index + 1 })), h("span", {
				className: "ap-row",
				style: { gap: 6 }
			}, h("button", {
				type: "button",
				className: "ap-btn link",
				disabled: index === 0,
				onClick: () => moveStage(index, -1)
			}, tAp("mm.moveUp")), h("button", {
				type: "button",
				className: "ap-btn link",
				disabled: index === editing.stages.length - 1,
				onClick: () => moveStage(index, 1)
			}, tAp("mm.moveDown")), h("button", {
				type: "button",
				className: "ap-btn link",
				disabled: editing.stages.length <= 1,
				onClick: () => removeStage(index)
			}, tAp("mm.deleteStage")))), h("label", { className: "ap-mm-field" }, tAp("mm.stageId"), h("input", {
				value: stage.id,
				onChange: (e) => patchStage(index, { id: e.target.value })
			})), h("label", { className: "ap-mm-field" }, tAp("mm.stageZh"), h("input", {
				value: stage.labelZh,
				onChange: (e) => patchStage(index, { labelZh: e.target.value })
			})), h("label", { className: "ap-mm-field" }, tAp("mm.stageHint"), h("input", {
				value: stage.hintZh,
				onChange: (e) => patchStage(index, { hintZh: e.target.value })
			})), h("label", { className: "ap-mm-field tall" }, tAp("mm.stagePrompt"), h("textarea", {
				value: stage.prompt,
				spellCheck: false,
				onChange: (e) => patchStage(index, { prompt: e.target.value })
			})), h("label", { className: "ap-mm-field" }, tAp("mm.skillSlugs"), h("input", {
				value: stage.skillSlugs,
				onChange: (e) => patchStage(index, { skillSlugs: e.target.value })
			})), index > 0 ? h("fieldset", { className: "ap-mm-checks" }, h("legend", null, tAp("mm.dependencies")), editing.stages.slice(0, index).map((upstream) => h("label", { key: upstream.id }, h("input", {
				type: "checkbox",
				checked: (stage.consumes || []).some((item) => item.kind === "handoff" && item.stageId === upstream.id),
				onChange: (e) => {
					const consumes = (stage.consumes || []).filter((item) => item.kind !== "handoff" || item.stageId !== upstream.id);
					if (e.target.checked) consumes.push({
						kind: "handoff",
						stageId: upstream.id
					});
					patchStage(index, { consumes });
				}
			}), " " + (upstream.labelZh || upstream.id)))) : null, h("label", { className: "ap-mm-field" }, tAp("mm.reviewSlugs"), h("input", {
				value: stage.reviewSkillSlugs,
				onChange: (e) => patchStage(index, { reviewSkillSlugs: e.target.value })
			})), h("label", { className: "ap-mm-field" }, tAp("mm.reviewPolicy"), h("select", {
				value: stage.reviewPolicy,
				onChange: (e) => patchStage(index, { reviewPolicy: e.target.value })
			}, h("option", { value: "risk-based" }, tAp("mm.reviewRisk")), h("option", { value: "all" }, tAp("mm.reviewAll")))), h("label", { className: "ap-mm-field" }, tAp("mm.binding"), h("select", {
				value: stage.binding,
				onChange: (e) => patchStage(index, { binding: e.target.value })
			}, h("option", { value: "" }, tAp("mm.bindNone")), h("option", { value: "analysis" }, tAp("mm.bindAnalysis")), h("option", { value: "pricing" }, tAp("mm.bindPricing")), h("option", { value: "planning" }, tAp("mm.bindPlanning")))), h("div", { className: "ap-mm-checks" }, h("label", null, h("input", {
				type: "checkbox",
				checked: !!stage.listsSources,
				onChange: (e) => patchStage(index, { listsSources: e.target.checked })
			}), " " + tAp("mm.listsSources")), h("label", null, h("input", {
				type: "checkbox",
				checked: !!stage.approvalEnabled,
				onChange: (e) => patchStage(index, { approvalEnabled: e.target.checked })
			}), " " + tAp("mm.approvalGate"))), stage.approvalEnabled ? h(react.Fragment, null, h("label", { className: "ap-mm-field" }, tAp("mm.approvalPrompt"), h("input", {
				value: stage.approvalPrompt,
				onChange: (e) => patchStage(index, { approvalPrompt: e.target.value })
			})), h("label", { className: "ap-mm-field" }, tAp("mm.approveLabel"), h("input", {
				value: stage.approveLabel,
				onChange: (e) => patchStage(index, { approveLabel: e.target.value })
			})), h("label", { className: "ap-mm-field" }, tAp("mm.rejectLabel"), h("input", {
				value: stage.rejectLabel,
				onChange: (e) => patchStage(index, { rejectLabel: e.target.value })
			}))) : null, h("label", { className: "ap-mm-field" }, tAp("mm.summaryFile"), h("input", {
				value: stage.summaryFile,
				onChange: (e) => patchStage(index, { summaryFile: e.target.value })
			})), h("label", { className: "ap-mm-field" }, tAp("mm.summaryOutline"), h("textarea", {
				value: stage.summaryOutline,
				spellCheck: false,
				onChange: (e) => patchStage(index, { summaryOutline: e.target.value })
			})))), h("div", {
				className: "ap-row",
				style: {
					justifyContent: "space-between",
					gap: 8,
					marginTop: 8
				}
			}, h("button", {
				type: "button",
				className: "ap-btn",
				disabled: editing.stages.length >= 12,
				onClick: addStage
			}, tAp("mm.addStage")), h("span", {
				className: "ap-row",
				style: { gap: 8 }
			}, h("button", {
				type: "button",
				className: "ap-btn",
				onClick: () => setEditing(null)
			}, tAp("mm.cancel")), h("button", {
				type: "button",
				className: "ap-btn primary",
				disabled: busy === "edit" || !editing.labelZh.trim() || !editing.stages.length,
				onClick: saveEdit
			}, busy === "edit" ? tAp("mm.saving") : tAp("mm.saveLive"))))) : null, h("section", { className: "ap-sec" }, h("h2", null, tAp("mm.list", { n: rows.length })), rows.map((row) => {
				const stages = row.workflow && Array.isArray(row.workflow.stages) ? row.workflow.stages : [];
				const open = viewingId === row.id;
				return h("div", {
					key: row.id,
					className: "ap-mm-card" + (row.disabled ? " off" : "")
				}, h("div", { className: "ap-mm-row" }, moduleIconNode(row, 18), h("div", { className: "grow" }, h("div", {
					className: "ap-row",
					style: { gap: 8 }
				}, h("strong", null, moduleLabel(row)), h("span", { className: "ap-chip" }, row.id), row.builtin ? h("span", { className: "ap-chip" }, tAp("mm.builtin")) : h("span", { className: "ap-chip" }, tAp("mm.custom"))), h("div", { className: "ap-sub" }, tAp("mm.stageCount", { n: row.stageCount }) + (row.sourcePath ? " · " + row.sourcePath : ""))), h("span", {
					className: "ap-row",
					style: {
						gap: 6,
						flexShrink: 0
					}
				}, h("button", {
					type: "button",
					className: "ap-btn link",
					disabled: !!busy,
					onClick: () => setViewingId(open ? "" : row.id)
				}, open ? tAp("mm.collapse") : tAp("mm.expand")), h("button", {
					type: "button",
					className: "ap-btn link",
					disabled: !!busy,
					onClick: () => beginEdit(row)
				}, row.builtin ? tAp("mm.copyThenEdit") : tAp("mm.editStages")), h("button", {
					type: "button",
					className: "ap-btn link",
					disabled: !!busy,
					onClick: () => beginCopy(row, false)
				}, tAp("mm.copyAsCustom")), h("button", {
					type: "button",
					className: "ap-btn link",
					onClick: () => {
						const definition = draftToDefinition(workflowToDraft(row));
						if (row.builtin) definition.id = suggestCopyId(row.id);
						const url = URL.createObjectURL(new Blob([JSON.stringify(definition, null, 2)], { type: "application/json" }));
						const link = document.createElement("a");
						link.href = url;
						link.download = definition.id + ".workbench.json";
						link.click();
						setTimeout(() => URL.revokeObjectURL(url), 1e3);
					}
				}, tAp("mm.exportDefinition")), row.sourcePath ? h("button", {
					type: "button",
					className: "ap-btn link",
					disabled: !!busy,
					title: tAp("mm.defFileTitle"),
					onClick: () => openInExplorer(cwd, row.sourcePath, { reveal: true }).catch(() => {})
				}, tAp("mm.defFile")) : null, !row.builtin ? h("button", {
					type: "button",
					className: "ap-btn link",
					disabled: !!busy,
					onClick: () => remove(row)
				}, tAp("mm.delete")) : null, h("button", {
					type: "button",
					className: "ap-switch" + (row.disabled ? "" : " on"),
					role: "switch",
					"aria-checked": !row.disabled,
					title: row.disabled ? tAp("mm.enable") : tAp("mm.disable"),
					disabled: !!busy,
					onClick: () => toggle(row)
				}, h("span", { className: "ap-switch-knob" })))), open ? h("div", { className: "ap-mm-stages" }, stages.length === 0 ? h("div", { className: "ap-sub" }, tAp("mm.noStages")) : stages.map((stage, index) => h("div", {
					key: stage.id || index,
					className: "ap-mm-stage"
				}, h("span", { className: "ap-chip" }, String(index + 1)), h("div", { className: "grow" }, h("strong", null, stage.labelZh || stage.label || stage.id), h("div", { className: "ap-sub" }, stage.hintZh || ""), stageMarks(stage) ? h("div", { className: "ap-sub" }, stageMarks(stage)) : null)))) : null);
			})), errors.length ? h("section", { className: "ap-sec" }, h("h2", null, tAp("mm.loadFailed")), errors.map((item, index) => h("div", {
				key: index,
				className: "ap-err",
				style: { marginTop: 6 }
			}, item.file + " — " + item.error))) : null));
		}
		const WorkbenchView = createWorkbenchView({
			h,
			Icon,
			tAp,
			workbenchText,
			moduleIconNode,
			moduleLabel,
			FilePickPanel
		});
		function Workbench(props) {
			useApLang();
			const capabilities = productCapabilities.use();
			const LIVE_POLL_MS = 45e3;
			const [data, setData] = react.useState(null);
			const [error, setError] = react.useState("");
			const [module, setModule] = react.useState(() => {
				try {
					return sessionStorage.getItem("ap-wb-module") || "tender";
				} catch {
					return "tender";
				}
			});
			const [draft, setDraft] = react.useState("");
			const [refreshing, setRefreshing] = react.useState(false);
			const [busy, setBusy] = react.useState("");
			const [selectedId, setSelectedId] = react.useState(() => {
				try {
					return sessionStorage.getItem("ap-wb-project") || "";
				} catch {
					return "";
				}
			});
			const [monitorState, setMonitorState] = react.useState(() => Object.assign({}, monitorEngine.state));
			const [, setSessionPulse] = react.useState(0);
			const [notice, setNotice] = react.useState("");
			const [lastCheck, setLastCheck] = react.useState(null);
			const [picking, setPicking] = react.useState(false);
			const [pickSelected, setPickSelected] = react.useState([]);
			const cwd = readWorkspaceCwd(props);
			const catalog = moduleList(data);
			const current = catalog.find((item) => item.id === module) || MODULES[module] || {
				id: module,
				labelZh: module,
				icon: "clipboardCheck"
			};
			const selectModule = (id) => {
				setModule(id);
				if (id !== "kb" && id !== "modules" && id !== "archive") setSelectedId("");
				try {
					sessionStorage.setItem("ap-wb-module", id);
					sessionStorage.removeItem("ap-wb-await-module");
				} catch {}
				window.dispatchEvent(new Event("agent-pi-wb-module-sync"));
			};
			react.useEffect(() => {
				const onModule = (event) => {
					const id = event && event.detail;
					if (!id || typeof id !== "string") return;
					selectModule(id);
					setWorkbenchOpen(true);
				};
				window.addEventListener("agent-pi-wb-module", onModule);
				return () => window.removeEventListener("agent-pi-wb-module", onModule);
			}, []);
			react.useEffect(() => {
				if (!data || !data.modules) return;
				let waiting = false;
				let known = [];
				try {
					waiting = sessionStorage.getItem("ap-wb-await-module") === "1";
					known = JSON.parse(sessionStorage.getItem("ap-wb-known-modules") || "[]");
				} catch {
					return;
				}
				if (!waiting || !known.length) return;
				const added = data.modules.filter((item) => item && item.id && !item.builtin && known.indexOf(item.id) < 0);
				if (!added.length) return;
				try {
					sessionStorage.removeItem("ap-wb-await-module");
				} catch {}
				selectModule(added[added.length - 1].id);
			}, [data]);
			const refresh = react.useCallback((silent) => {
				if (!capabilities.workbench) {
					setData({
						modules: [],
						projects: [],
						workflows: []
					});
					setError("");
					return Promise.resolve();
				}
				if (!cwd) {
					setError("先选择一个工作区");
					return Promise.resolve();
				}
				if (!silent) setError("");
				setRefreshing(true);
				return api("/api/agent-pi/workbench", cwd, { method: "GET" }).then((body) => {
					setData(body);
					setLastCheck(Date.now());
				}).catch((e) => {
					if (!silent) setError(String(e.message || e));
				}).finally(() => setRefreshing(false));
			}, [cwd, capabilities.workbench]);
			react.useEffect(() => {
				if (module === "archive") {
					setError("");
					return;
				}
				refresh();
			}, [refresh, module]);
			react.useEffect(() => {
				const onCreated = (event) => {
					const id = event && event.detail && event.detail.projectId;
					const nextModule = event && event.detail && event.detail.module;
					if (nextModule) selectModule(nextModule);
					if (id) {
						setSelectedId(id);
						try {
							sessionStorage.setItem("ap-wb-project", id);
						} catch {}
					}
					refresh();
				};
				window.addEventListener("agent-pi-created", onCreated);
				return () => window.removeEventListener("agent-pi-created", onCreated);
			}, [refresh]);
			react.useEffect(() => {
				const onRequirement = () => refresh(true);
				window.addEventListener("agent-pi-user-requirement", onRequirement);
				return () => window.removeEventListener("agent-pi-user-requirement", onRequirement);
			}, [refresh]);
			const projects = (data && data.projects ? data.projects : []).filter((row) => row.project.module === module);
			react.useEffect(() => {
				if (!projects.length) return;
				if (!selectedId || !projects.some((row) => row.project.projectId === selectedId)) setSelectedId(projects[0].project.projectId);
			}, [projects, selectedId]);
			react.useEffect(() => {
				if (module === "kb" || module === "modules" || module === "archive") return;
				if (!data || !catalog.length) return;
				if (!catalog.some((item) => item.id === module)) selectModule(catalog[0].id);
			}, [
				data,
				module,
				catalog.map((item) => item.id).join(",")
			]);
			const row = projects.find((item) => item.project.projectId === selectedId) || null;
			const [reality, setReality] = react.useState(null);
			const [control, setControl] = react.useState(null);
			react.useEffect(() => {
				setReality(null);
				setControl(null);
			}, [selectedId]);
			react.useEffect(() => {
				const onMonitor = () => {
					setMonitorState(Object.assign({}, monitorEngine.state));
					if (monitorEngine.state.lastReality) setReality(monitorEngine.state.lastReality);
					if (monitorEngine.state.lastControl) setControl(monitorEngine.state.lastControl);
					refresh(true);
				};
				window.addEventListener("agent-pi-monitor-changed", onMonitor);
				return () => window.removeEventListener("agent-pi-monitor-changed", onMonitor);
			}, [refresh]);
			react.useEffect(() => {
				const list = runtime.sessions && runtime.sessions.list;
				if (!list || typeof list.subscribe !== "function") return void 0;
				return list.subscribe(() => setSessionPulse((value) => value + 1));
			}, []);
			react.useEffect(() => {
				if (module === "archive" || module === "kb" || module === "modules") return;
				const id = setInterval(() => {
					refresh(true);
				}, LIVE_POLL_MS);
				return () => clearInterval(id);
			}, [refresh, module]);
			const runCheck = (project) => {
				setBusy("check:");
				setError("");
				return api("/api/agent-pi/stage", cwd, {
					method: "POST",
					body: JSON.stringify({
						action: "check",
						module: project.module,
						projectId: project.projectId,
						sessionId: pinParentSessionId() || resolveSessionId(props) || runtime.sessionId || ""
					})
				}).then((result) => {
					setReality(result.reality || null);
					setControl(result.control || null);
					monitorEngine.state.lastReality = result.reality || null;
					monitorEngine.state.lastControl = result.control || null;
					return refresh(true);
				}).catch((e) => setError(String(e.message || e))).finally(() => setBusy(""));
			};
			const updateRequirement = (project, requirement, action) => {
				if (!project || !requirement || !action) return Promise.resolve();
				if (action === "accept_requirement" && !window.confirm("确认以这条用户要求替代本阶段旧的文件名、篇幅、章节和视图门禁？实际 BOQ、能力包、来源和引用完整性仍不可跳过。")) return Promise.resolve();
				setBusy(action + ":" + requirement.id);
				setError("");
				setNotice("");
				return api("/api/agent-pi/stage", cwd, {
					method: "POST",
					body: JSON.stringify({
						action,
						module: project.module,
						projectId: project.projectId,
						stageId: requirement.stageId,
						requirementId: requirement.id,
						sessionId: requirement.sessionId
					})
				}).then(() => {
					setNotice(action === "accept_requirement" ? "已把用户要求设为本阶段验收口径；旧软门禁不再触发重复返工。" : action === "satisfy_requirement" ? "已记录要求落实状态。" : action === "reopen_requirement" ? "已把要求退回主会话继续修改。" : "已从项目要求中移除。");
					return refresh(true);
				}).catch((e) => setError(String(e && e.message || e))).finally(() => setBusy(""));
			};
			const runStage = (project, stageId, action, submit, closeWorkbench) => {
				const parentId = pinParentSessionId();
				setBusy(action + ":" + (stageId || ""));
				setError("");
				setNotice("");
				if (submit && !parentId) {
					setBusy("");
					setError("请先打开或新建一个主会话，再启动专业项目。");
					return Promise.resolve();
				}
				const activeTransaction = submit ? workbenchTransactions.get(parentId) : null;
				if (activeTransaction && (activeTransaction.phase === "prepared" || activeTransaction.phase === "committed") && (activeTransaction.payload.cwd !== cwd || activeTransaction.payload.module !== project.module || activeTransaction.payload.projectId !== project.projectId)) {
					setBusy("");
					setError("当前主会话已有另一项专业项目事务，请先暂停或结束。");
					return Promise.resolve();
				}
				return api("/api/agent-pi/stage", cwd, {
					method: "POST",
					body: JSON.stringify({
						action: action || "prepare",
						module: project.module,
						projectId: project.projectId,
						stageId,
						sessionId: parentId || resolveSessionId(props) || runtime.sessionId || "active"
					})
				}).then((result) => {
					if (result.blocked) {
						setError(result.blocked);
						if (result.draft) setDraft(result.draft);
						return refresh();
					}
					if (result.done) {
						setNotice(result.message || "流程已全部完成。");
						return refresh();
					}
					if (result.alreadyDispatched) {
						if (submit) {
							monitorEngine.start({
								cwd,
								module: project.module,
								projectId: project.projectId
							});
							if (closeWorkbench !== false) focusMainConversation(props);
						}
						setNotice(result.message || "阶段稿已写入主对话，等待执行。");
						return refresh();
					}
					if (result.closed && result.message) setNotice(result.message);
					if (!result.draft) {
						if (result.message) setNotice(result.message);
						return refresh();
					}
					setDraft(result.draft);
					if (!submit) {
						const activeId = resolveSessionId(props) || runtime.sessionId || "";
						if (!result.closed && parentId && activeId && parentId !== activeId) return dispatchToConversation({}, result.draft, parentId).then((ok) => {
							if (ok) setNotice("已把待处理稿直接送回主对话。");
							return refresh();
						});
						if (!result.closed) fillComposer(props, result.draft);
						return refresh();
					}
					const ownsPreparedTransaction = prepareWorkbenchTransaction(parentId, {
						cwd,
						module: project.module,
						projectId: project.projectId
					}).phase === "prepared";
					return dispatchToConversation(props, result.draft, parentId).then((ok) => {
						if (ok && result.dispatch) api("/api/agent-pi/stage", cwd, {
							method: "POST",
							body: JSON.stringify({
								action: "mark_dispatched",
								module: project.module,
								projectId: project.projectId,
								stageId: result.dispatch.stageId,
								key: result.dispatch.key
							})
						}).catch(() => {});
						if (ok) {
							monitorEngine.start({
								cwd,
								module: project.module,
								projectId: project.projectId
							});
							if (closeWorkbench !== false) focusMainConversation(props);
						}
						return refresh();
					}).catch((e) => {
						if (ownsPreparedTransaction) settleWorkbenchTransaction(parentId, "failed", e);
						return (result.dispatch ? api("/api/agent-pi/stage", cwd, {
							method: "POST",
							body: JSON.stringify({
								action: "release_dispatch",
								module: project.module,
								projectId: project.projectId,
								stageId: result.dispatch.stageId,
								key: result.dispatch.key
							})
						}).catch(() => {}) : Promise.resolve()).then(() => {
							setError(String(e.message || e));
							return refresh();
						});
					});
				}).catch((e) => setError(String(e.message || e))).finally(() => setBusy(""));
			};
			const decideStage = (project, stage, decision) => {
				if (!project || !stage || !stage.approvalGate) return Promise.resolve();
				if (decision === "rejected" && !window.confirm("确认暂停本项目，不进入下一阶段？已生成成果和项目状态都会保留。")) return Promise.resolve();
				const action = decision === "approved" ? "approve_gate" : "reject_gate";
				setBusy(action + ":" + stage.id);
				setError("");
				setNotice("");
				return api("/api/agent-pi/stage", cwd, {
					method: "POST",
					body: JSON.stringify({
						action,
						module: project.module,
						projectId: project.projectId,
						stageId: stage.id
					})
				}).then(() => {
					if (decision === "rejected") {
						monitorEngine.stop("用户已决定暂停本项目。", "failed");
						setNotice("已记录「不继续」决定，流程保持暂停。");
						return refresh(true);
					}
					setNotice("人工决策已记录，正在准备下一阶段。");
					return runStage(project, "", "resume", true);
				}).catch((e) => setError(String(e && e.message || e))).finally(() => setBusy(""));
			};
			const openCreate = () => {
				window.dispatchEvent(new CustomEvent("agent-pi-open-create", { detail: {
					cwd,
					module
				} }));
			};
			const openAdopt = () => {
				window.dispatchEvent(new CustomEvent("agent-pi-open-create", { detail: {
					cwd,
					module,
					mode: "adopt"
				} }));
			};
			const selectProject = (id) => {
				setSelectedId(id);
				try {
					sessionStorage.setItem("ap-wb-project", id);
				} catch {}
			};
			const monitoringHere = monitorState.monitoring && row && row.project && monitorState.projectId === row.project.projectId && monitorState.cwd === cwd;
			const liveActivity = sessionActivity(readSessionListSnap(), monitorState.parentSessionId);
			const liveActivityText = liveActivity.runningChildCount > 0 ? liveActivity.runningChildCount + " 个子智能体执行中" : liveActivity.parentRunning ? "主对话执行中" : "";
			const addFiles = () => {
				if (!row) return;
				setPickSelected(row.project.inputPaths || []);
				setPicking(true);
			};
			const restoreSources = (project, extra) => {
				setBusy("restore");
				setError("");
				setNotice(extra && extra.preferMineru ? workbenchText("正在用 MinerU 对齐原稿…") : workbenchText("正在按知识库逻辑对齐原稿…"));
				return api("/api/agent-pi/projects/restore", cwd, {
					method: "POST",
					body: JSON.stringify({
						module: project.module,
						projectId: project.projectId,
						force: !!(extra && extra.force),
						preferMineru: !!(extra && extra.preferMineru)
					})
				}).then((batch) => {
					const ok = (batch.restored || []).length;
					const skipped = (batch.skipped || []).filter((item) => item.reason !== "unsupported");
					setNotice(ok ? workbenchText("已对齐 ") + ok + workbenchText(" 份原稿") + (skipped.length ? workbenchText("；") + skipped.length + workbenchText(" 份未对齐") : "") + workbenchText("。点文件名可预览改稿，保存会同步 JSON。") : skipped.length ? workbenchText("原稿对齐未完成：") + skipped.map((item) => item.reason).join(workbenchText("；")) : workbenchText("没有需要对齐的原稿。"));
					return refresh();
				});
			};
			const saveFiles = () => {
				if (!row) return;
				setBusy("files");
				api("/api/agent-pi/projects", cwd, {
					method: "PATCH",
					body: JSON.stringify({
						module: row.project.module,
						projectId: row.project.projectId,
						inputPaths: pickSelected
					})
				}).then(() => {
					setPicking(false);
					return restoreSources(row.project);
				}).catch((e) => setError(String(e.message || e))).finally(() => setBusy(""));
			};
			const removeProject = () => {
				if (!row) return;
				if (!window.confirm(workbenchText("从工作台移除项目「") + row.project.name + workbenchText("」？磁盘上的项目文件会保留。"))) return;
				setBusy("remove");
				api("/api/agent-pi/projects", cwd, {
					method: "DELETE",
					body: JSON.stringify({
						module: row.project.module,
						projectId: row.project.projectId
					})
				}).then(() => {
					setSelectedId("");
					refresh();
				}).catch((e) => setError(String(e.message || e))).finally(() => setBusy(""));
			};
			const togglePick = (path, _name, forceAdd) => {
				setPickSelected((current) => {
					const has = current.indexOf(path) >= 0;
					if (forceAdd && has) return current;
					if (has) return current.filter((item) => item !== path);
					return current.concat([path]);
				});
			};
			const renderOverview = (item) => {
				const project = item.project;
				const wf = item.workflow;
				const stages = wf.stages || [];
				const setupId = wf.setupStageId || "";
				const evidence = item.evidence;
				const requirements = (item.userRequirements || []).filter((requirement) => requirement.status !== "dismissed");
				const activeControl = control && control.execution && control.execution.projectId === project.projectId ? control : null;
				const execution = activeControl && activeControl.execution || item.execution || null;
				const currentReality = reality && reality.stages ? reality.stages.find((stage) => stage.stageId === item.currentStageId) || null : null;
				const currentSlice = item.currentStageId ? stageSlice(item, item.currentStageId) : null;
				const executionStatusLabel = execution ? {
					planning: workbenchText("规划中"),
					working: workbenchText("执行中"),
					waiting: workbenchText("等待回推"),
					blocked: workbenchText("已阻塞"),
					completed: workbenchText("已完成"),
					failed: workbenchText("失败")
				}[execution.status] || execution.status : workbenchText("未回写");
				const alignmentLabel = activeControl ? {
					aligned: workbenchText("已对齐"),
					missing: workbenchText("缺执行账本"),
					drifted: workbenchText("存在差异"),
					stale: workbenchText("心跳过期"),
					"waiting-human": workbenchText("等待人工")
				}[activeControl.alignment] || activeControl.alignment : workbenchText("待核验");
				const forceTarget = stages.find((stage) => {
					if (setupId && stage.id === setupId) return false;
					const slice = stageSlice(item, stage.id);
					return slice && (slice.status === "blocked" || evidence && evidence.blocking);
				});
				setupId && stageSlice(item, setupId);
				return h("div", { className: "ap-ov-main" }, h("header", { className: "ap-ov-hd" }, h("div", { style: { minWidth: 0 } }, h("h1", null, project.name), h("div", { className: "ap-path" }, Icon("folder", 14), h("span", { title: project.rootPath }, project.rootPath || cwd))), h("div", { className: "ap-actions" }, h("button", {
					type: "button",
					className: "ap-btn",
					onClick: addFiles
				}, Icon("filePlus", 14), workbenchText("添加资料")), h("button", {
					type: "button",
					className: "ap-btn primary",
					title: workbenchText("同一条推进口：未齐套先确认资料，否则恢复未完阶段。已写入的阶段稿不会再灌一遍。"),
					onClick: () => {
						const next = stages.find((stage) => {
							const slice = stageSlice(item, stage.id);
							return !slice || slice.status !== "done";
						});
						if (!next) {
							setNotice(workbenchText("所有阶段均已完成；如需重跑，请对相应阶段「重置编排」。"));
							return;
						}
						if (setupId && next.id === setupId) {
							restoreSources(project).then(() => runStage(project, setupId, "complete", true)).catch((e) => setError(String(e.message || e)));
							return;
						}
						runStage(project, "", "resume", true);
					}
				}, Icon("play", 14), workbenchText("继续推进")), h("button", {
					type: "button",
					className: "ap-btn ghost",
					onClick: removeProject
				}, Icon("trash", 14), workbenchText("移除项目")))), requirements.length ? h("section", {
					className: "ap-sec ap-user-reqs",
					"aria-label": workbenchText("用户要求（最高优先级）")
				}, h("div", { className: "ap-user-req-head" }, h("div", null, h("h2", null, workbenchText("用户要求（最高优先级）")), h("p", { className: "ap-sub" }, workbenchText("主会话的新要求与工作台共用这份账本；只改受影响成果，不再让旧软门禁触发整阶段返工。"))), h("span", { className: "ap-chip" }, requirements.filter((requirement) => requirement.status === "active").length + workbenchText(" 条待落实"))), requirements.slice(0, 6).map((requirement) => {
					const statusLabel = requirement.status === "active" ? workbenchText("待落实") : requirement.status === "implemented" ? workbenchText("已落实") : workbenchText("已采用为验收口径");
					const statusClass = requirement.status === "active" ? " warn" : " ok";
					return h("article", {
						className: "ap-user-req",
						key: requirement.id
					}, h("div", { className: "ap-user-req-main" }, h("div", { className: "ap-row" }, h("span", { className: "ap-chip" + statusClass }, statusLabel), h("span", { className: "ap-sub" }, requirement.stageId)), h("p", null, requirement.text), requirement.note ? h("p", { className: "ap-sub" }, workbenchText("落实说明：") + requirement.note) : null, requirement.evidencePaths && requirement.evidencePaths.length ? h("p", { className: "ap-sub" }, workbenchText("影响成果：") + requirement.evidencePaths.join("、")) : null), h("div", { className: "ap-user-req-actions" }, requirement.status === "active" ? h("button", {
						type: "button",
						className: "ap-btn",
						disabled: !!busy,
						onClick: () => updateRequirement(project, requirement, "satisfy_requirement")
					}, workbenchText("标记已落实")) : requirement.status === "implemented" ? h(react.Fragment, null, h("button", {
						type: "button",
						className: "ap-btn primary",
						disabled: !!busy,
						onClick: () => updateRequirement(project, requirement, "accept_requirement")
					}, workbenchText("采用为验收口径")), h("button", {
						type: "button",
						className: "ap-btn",
						disabled: !!busy,
						onClick: () => updateRequirement(project, requirement, "reopen_requirement")
					}, workbenchText("继续修改"))) : null, requirement.status !== "accepted" ? h("button", {
						type: "button",
						className: "ap-btn ghost",
						disabled: !!busy,
						onClick: () => updateRequirement(project, requirement, "dismiss_requirement")
					}, workbenchText("不属于本项目")) : null));
				})) : null, h("section", { className: "ap-sec" }, h("div", { className: "ap-mon-hd" }, h("div", { style: { minWidth: 0 } }, h("h2", null, workbenchText("流程监控")), h("p", { className: "ap-sub" }, workbenchText("只有点「继续推进」才启动当前主会话事务；已启动事务会在应用重启后恢复，遇到人工决策门、阻塞或异常会停止。分析阶段只维护一套可追溯底稿。"))), h("div", { className: "ap-mon-tools" }, h("span", { className: "ap-row" }, h("i", { className: "ap-dot" + (monitoringHere && !monitorState.paused || liveActivityText ? " on" : "") }), !monitoringHere ? liveActivityText || (monitorState.monitoring ? workbenchText("另一项目事务正在运行") : workbenchText("点继续推进后启动当前会话事务")) : (monitorState.paused ? workbenchText("当前会话事务已暂停") : workbenchText("当前会话事务空闲")) + (liveActivityText ? " · " + liveActivityText : "")), h("span", null, workbenchText("检查于 ") + (monitorState.lastCheck ? formatClock(new Date(monitorState.lastCheck).toISOString()) : lastCheck ? formatClock(new Date(lastCheck).toISOString()) : "—")), h("button", {
					type: "button",
					className: "ap-btn",
					disabled: busy === "check:",
					title: workbenchText("对每个阶段做盘面对账：任务与产物、阶段总控、投标分析底稿、实际工程量清单、测算表、引用孤儿和人工门禁"),
					onClick: () => runCheck(project)
				}, Icon("search", 14), busy === "check:" ? workbenchText("体检中…") : workbenchText("检查")), h("button", {
					type: "button",
					className: "ap-btn",
					disabled: !forceTarget && !(evidence && evidence.blocking),
					title: forceTarget || evidence && evidence.blocking ? workbenchText("解除缺件门槛：缺口保持为缺口，不授权联网尽调。") : workbenchText("当前没有缺件门槛可放行"),
					onClick: () => {
						if (!window.confirm(workbenchText("解除缺件门槛：缺口保持为缺口、继续使用已有资料，不授权联网尽调（联网需在对话中授权）。不会删除已完成批次。"))) return;
						runStage(project, forceTarget && forceTarget.id || item.currentStageId || stages[0] && stages[0].id || "", "force_pass", false);
					}
				}, Icon("unlock", 14), workbenchText("强制放行")), monitoringHere && !monitorState.paused ? h("button", {
					type: "button",
					className: "ap-btn ghost",
					title: workbenchText("暂停当前会话事务，不中断当前对话"),
					onClick: () => monitorEngine.pause()
				}, Icon("square", 14), workbenchText("暂停事务")) : monitoringHere && monitorState.paused ? h("button", {
					type: "button",
					className: "ap-btn ghost",
					onClick: () => {
						monitorEngine.unpause();
						refresh(true);
					}
				}, Icon("play", 14), workbenchText("恢复事务")) : null)), h("div", { className: "ap-dual-state" }, h("article", { className: "ap-state-card" }, h("div", { className: "ap-state-card-hd" }, h("div", null, h("strong", null, workbenchText("执行态（主智能体回写）")), h("span", { className: "ap-sub" }, workbenchText("主对话负责理解、计划、派活与阻塞说明"))), h("span", { className: "ap-chip" + (execution && execution.status === "blocked" ? " warn" : execution ? " ok" : "") }, executionStatusLabel)), execution ? h("div", { className: "ap-state-body" }, h("p", null, h("b", null, workbenchText("目标：")), execution.objective || workbenchText("未登记")), h("p", null, h("b", null, workbenchText("当前批次：")), execution.currentBatch || workbenchText("未登记")), h("p", null, h("b", null, workbenchText("下一动作：")), execution.nextAction || workbenchText("未登记")), execution.plan && execution.plan.length ? h("div", { className: "ap-mini-list" }, execution.plan.slice(0, 5).map((plan) => h("div", { key: plan.id }, h("i", { className: "ap-mini-status " + plan.status }), h("span", null, plan.title)))) : h("p", { className: "ap-sub" }, workbenchText("尚未登记结构化计划。")), execution.assignments && execution.assignments.length ? h("p", { className: "ap-sub" }, workbenchText("子任务：") + execution.assignments.map((assignment) => assignment.title + " [" + assignment.status + "]").join(" · ")) : null, execution.blocker && execution.blocker.type !== "none" ? h("p", { className: "ap-state-alert" }, workbenchText("阻塞：") + (execution.blocker.reason || execution.blocker.needed || execution.blocker.type)) : null, h("p", { className: "ap-sub" }, "revision " + execution.revision + workbenchText(" · 心跳 ") + formatClock(execution.heartbeatAt))) : h("div", { className: "ap-state-empty" }, workbenchText("主智能体尚未回写执行计划。点「继续推进」后，主对话应先读取 status，再登记目标、批次、计划和下一动作。"))), h("article", { className: "ap-state-card" }, h("div", { className: "ap-state-card-hd" }, h("div", null, h("strong", null, workbenchText("事实态（系统核验）")), h("span", { className: "ap-sub" }, workbenchText("只核验磁盘成果、BOQ、证据、引用与人工门禁"))), h("span", { className: "ap-chip" + (activeControl && activeControl.alignment !== "aligned" ? " warn" : currentReality ? " ok" : "") }, alignmentLabel)), h("div", { className: "ap-state-body" }, h("p", null, h("b", null, workbenchText("当前阶段：")), currentReality ? stageLabel(stages.find((stage) => stage.id === currentReality.stageId), langState.lang) || currentReality.stageLabel : item.currentStageId || workbenchText("未开始")), currentReality ? h("p", null, workbenchText("任务 ") + currentReality.tasks.done + "/" + currentReality.tasks.total, currentReality.summary ? currentReality.summary.exists ? workbenchText(" · 总报告已就位") : workbenchText(" · 缺《") + currentReality.summary.fileName + (langState.lang === "zh" ? "》" : "”") : "", currentReality.boqInventory ? currentReality.boqInventory.ok ? workbenchText(" · BOQ 已核验") : workbenchText(" · BOQ 有缺口") : "", currentReality.citations && currentReality.citations.total ? workbenchText(" · 孤儿引用 ") + currentReality.citations.orphans : "") : h("p", { className: "ap-sub" }, workbenchText("尚未执行本轮事实核验；阶段状态为 ") + (currentSlice && currentSlice.status || "idle") + "。"), activeControl && activeControl.realityDigest ? h("p", { className: "ap-sub" }, workbenchText("事实版本 ") + activeControl.realityDigest) : null))), activeControl && activeControl.differences && activeControl.differences.length ? h("div", { className: "ap-alignment-alert" }, h("strong", null, workbenchText("认知差异")), h("ul", null, activeControl.differences.map((difference, index) => h("li", { key: index }, difference)))) : null, reality && reality.stages ? h("div", { className: "ap-check" }, h("div", { className: "ap-check-hd" }, workbenchText("系统事实明细"), h("span", { className: "ap-sub" }, formatClock(reality.generatedAt) + (reality.stages[0] && reality.stages[0].quietMinutes != null ? workbenchText(" · 最近产出 ") + reality.stages[0].quietMinutes + workbenchText(" 分钟前") : "")), h("button", {
					type: "button",
					className: "ap-btn ghost",
					onClick: () => setReality(null)
				}, workbenchText("收起"))), reality.stages.map((st, index) => {
					const parts = [];
					if (st.userRequirements && st.userRequirements.active > 0) parts.push(workbenchText("用户要求待落实 ") + st.userRequirements.active + workbenchText(" 条"));
					else if (st.userRequirementOverride) parts.push(workbenchText("用户验收口径已生效"));
					if (st.tasks && st.tasks.total > 0) parts.push(workbenchText("任务 ") + st.tasks.done + "/" + st.tasks.total + (st.tasks.error ? (langState.lang === "zh" ? "（" : " (") + st.tasks.error + workbenchText(" 个 error）") : ""));
					const missing = st.artifacts ? st.artifacts.missingMarkdown.length + st.artifacts.missingReport.length : 0;
					if (missing > 0) parts.push(workbenchText("缺产物 ") + missing + workbenchText(" 份"));
					if (st.summary) parts.push(st.summary.exists ? workbenchText("总报告已就位") : workbenchText("缺《") + st.summary.fileName + (langState.lang === "zh" ? "》" : "”"));
					if (st.suite) if (st.suite.ok) parts.push(workbenchText("投标分析底稿已齐"));
					else if (st.suite.shortGaps) parts.push(st.suite.shortGaps);
					else parts.push(workbenchText("投标分析底稿未齐"));
					if (st.boqInventory) if (st.boqInventory.ok) parts.push(workbenchText("工程量清单已抽出 ") + (st.boqInventory.touchedCount || st.boqInventory.itemCount || 0) + workbenchText(" 行"));
					else if (st.boqInventory.shortGaps) parts.push(st.boqInventory.shortGaps);
					else parts.push(workbenchText("未摸到工程量清单"));
					if (st.workbook) parts.push(st.workbook.exists ? workbenchText("测算表已就位") : workbenchText("缺《") + st.workbook.fileName + (langState.lang === "zh" ? "》" : "”"));
					if (st.stageId === item.currentStageId && st.citations && st.citations.total > 0) parts.push(workbenchText("引用 ") + st.citations.total + workbenchText(" 令牌 / ") + st.citations.orphans + workbenchText(" 孤儿"));
					if (st.evidence && st.evidence.blocking) parts.push(workbenchText("门禁阻塞（") + st.evidence.gapCount + workbenchText(" 缺口）"));
					else if (st.evidence && st.evidence.waived) parts.push(workbenchText("门禁已放行"));
					const unfinishedTasks = st.tasks ? st.tasks.total - st.tasks.done : 0;
					const bad = typeof st.needsQc === "boolean" ? st.needsQc : missing > 0 || st.summary && !st.summary.exists && st.stageStatus !== "idle" || st.suite && !st.suite.ok && st.stageStatus !== "idle" || st.boqInventory && !st.boqInventory.ok && st.stageStatus !== "idle" || st.workbook && !st.workbook.exists && st.stageStatus !== "idle" || st.evidence && st.evidence.blocking || st.stageId === item.currentStageId && st.citations && st.citations.orphans > 0 || st.stageStatus === "done" && unfinishedTasks > 0;
					const idleText = st.stageStatus === "idle" ? workbenchText("未开始") : st.stageStatus === "done" && !bad ? workbenchText("阶段已收口（商务待办不挡完成）") : workbenchText("无异常");
					return h("div", {
						className: "ap-check-row" + (bad ? " bad" : ""),
						key: st.stageId
					}, h("span", { className: "ap-check-num" }, index + 1), h("strong", null, stageLabel(stages.find((stage) => stage.id === st.stageId), langState.lang) || st.stageLabel), statusChip(st.stageStatus), h("span", { className: "ap-sub" }, parts.length ? parts.join(" · ") : idleText));
				})) : null, stages.map((stage, index) => {
					const slice = stageSlice(item, stage.id);
					const stageMemory = item.memory && item.memory.stages ? item.memory.stages[stage.id] : null;
					const tasks = slice && slice.tasks || [];
					const done = tasks.filter((task) => task.status === "done").length;
					const failed = tasks.filter((task) => task.status === "error").length;
					const percent = tasks.length ? Math.round(done / tasks.length * 100) : slice && slice.status === "done" ? 100 : 0;
					const setupDone = slice && slice.status === "done";
					const checkRow = reality && reality.stages ? reality.stages.find((st) => st.stageId === stage.id) : null;
					const closedClean = setupDone && stageMemory && stageMemory.status === "current" && !stageRowDirty(slice, tasks, checkRow);
					const outFolder = checkRow && checkRow.outputFolder || officialFolder(stage.id);
					const stageHint$1 = closedClean ? workbenchText("阶段已收口。成果在 Agent Pi Outputs/") + project.projectId + "/" + outFolder + workbenchText("/。询价、开工确认、submission_audit 未通过是投标可提交门禁，不表示本阶段没做完。") : stageHint(stage, langState.lang);
					return h("div", {
						className: "ap-stage-row",
						key: stage.id
					}, h("span", { className: "ap-stage-num" }, index + 1), h("div", { className: "ap-stage-body" }, h("div", { className: "ap-row" }, h("strong", null, stageLabel(stage, langState.lang)), statusChip(slice && slice.status), stageMemory && stageMemory.status === "current" ? h("span", {
						className: "ap-chip ok",
						title: stageMemory.path
					}, workbenchText("基线 v") + stageMemory.revision) : stageMemory && stageMemory.status === "stale" ? h("span", {
						className: "ap-chip warn",
						title: stageMemory.staleReason || ""
					}, workbenchText("记忆已失效")) : slice && slice.status === "done" ? h("span", { className: "ap-chip warn" }, workbenchText("待生成记忆")) : null, slice && slice.forcePassedAt ? h("span", { className: "ap-chip" }, workbenchText("已强制放行")) : null, slice && slice.approval && slice.approval.decision === "approved" ? h("span", { className: "ap-chip ok" }, workbenchText("用户已确认")) : slice && slice.approval && slice.approval.decision === "rejected" ? h("span", { className: "ap-chip warn" }, workbenchText("用户已暂停")) : stage.approvalGate && slice ? h("span", { className: "ap-chip warn" }, workbenchText("待用户决策")) : null), h("p", { className: "ap-stage-hint" }, stageHint$1), stageMemory && stageMemory.inputs && stageMemory.inputs.length ? h("p", { className: "ap-sub" }, workbenchText("前序基线：") + stageMemory.inputs.map((input) => {
						const upstream = stages.find((item) => item.id === input.ref);
						return (input.kind === "handoff" ? stageLabel(upstream, langState.lang) || input.ref : workbenchText("能力包 ") + input.ref) + (input.revision ? " v" + input.revision : "") + (input.status === "current" ? "" : (langState.lang === "zh" ? "（" : " (") + input.status + (langState.lang === "zh" ? "）" : ")"));
					}).join(" · ")) : null, slice && slice.blockedReason ? h("div", { className: "ap-err" }, slice.blockedReason) : null, evidence && stage.id !== setupId && evidence.gaps && evidence.gaps.length && (stage.id === item.currentStageId || slice && slice.status === "blocked" || stage.id === "tender-document-analysis") ? evidence.gaps.slice(0, 4).map((gap) => h("div", {
						className: "ap-gap",
						key: stage.id + gap.chapterId
					}, h("span", { className: "ap-chip warn" }, workbenchText("缺口")), gap.title + " — " + gap.suggestedUpload)) : null, tasks.length ? h("div", { style: { marginTop: 8 } }, h("div", { className: "ap-bar" + (failed ? " fail" : "") }, h("i", { style: { width: percent + "%" } })), h("div", { className: "ap-sub" }, workbenchText("清单 ") + done + "/" + tasks.length + (failed ? workbenchText(" · 失败 ") + failed : "")), tasks.slice(0, 8).map((task) => {
						const restore = findSetupRestore(item.restores, task.sourcePath || task.markdownPath);
						const setupFile = !!(setupId && stage.id === setupId && (task.sourcePath || task.markdownPath));
						const alignable = setupFile && /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|png|jpe?g|jp2|webp|gif|bmp)$/i.test(task.sourcePath || "");
						return h("div", {
							className: "ap-task",
							key: task.id
						}, h("button", {
							type: "button",
							className: "ap-task-open",
							title: restore && restore.manuscriptPath || task.markdownPath || task.sourcePath,
							onClick: () => window.dispatchEvent(new CustomEvent("agent-pi-open-file", { detail: {
								cwd,
								path: task.markdownPath || restoreOpenPath(task.sourcePath, item.restores) || task.sourcePath
							} }))
						}, task.title), setupFile && restore ? h("span", {
							className: "ap-chip ok",
							title: restore.manuscriptPath
						}, workbenchText("已对齐")) : alignable ? h("span", { className: "ap-chip" }, workbenchText("待对齐")) : h("span", { className: "ap-chip" + (task.status === "done" ? " ok" : task.status === "error" ? " warn" : "") }, taskStatusLabel(task.status)));
					})) : null), h("div", { className: "ap-stage-acts" }, stage.approvalGate && slice && slice.status !== "done" ? h(react.Fragment, null, h("button", {
						type: "button",
						className: "ap-btn primary",
						disabled: !!busy,
						title: stageGate(stage, "promptZh", langState.lang),
						onClick: () => decideStage(project, stage, "approved")
					}, busy === "approve_gate:" + stage.id ? workbenchText("记录中…") : stageGate(stage, "approveLabelZh", langState.lang)), stage.approvalGate.rejectLabelZh ? h("button", {
						type: "button",
						className: "ap-btn ghost",
						disabled: !!busy,
						onClick: () => decideStage(project, stage, "rejected")
					}, stageGate(stage, "rejectLabelZh", langState.lang)) : null) : null, setupId && stage.id === setupId ? h(react.Fragment, null, h("button", {
						type: "button",
						className: "ap-btn primary",
						disabled: !!busy || !(project.inputPaths && project.inputPaths.length),
						title: workbenchText("按知识库同一套逻辑把已登记 PDF / Word / Excel 对齐成 setup/ 解析稿"),
						onClick: () => restoreSources(project, { force: true }).catch((e) => setError(String(e.message || e))).finally(() => setBusy(""))
					}, busy === "restore" ? workbenchText("对齐中…") : workbenchText("对齐原稿")), setupDone ? h("button", {
						type: "button",
						className: "ap-btn",
						onClick: () => setWorkbenchOpen(false)
					}, workbenchText("资料已齐套")) : h("button", {
						type: "button",
						className: "ap-btn",
						disabled: !!busy,
						onClick: () => {
							restoreSources(project).then(() => runStage(project, setupId, "complete", true)).catch((e) => setError(String(e.message || e)));
						}
					}, busy === "complete:" + setupId || busy === "restore" ? workbenchText("对齐并确认中…") : workbenchText("资料齐套，进入下一阶段"))) : h(react.Fragment, null, closedClean ? h("button", {
						type: "button",
						className: "ap-btn primary",
						title: workbenchText("打开本阶段正式成果目录"),
						onClick: () => {
							openInExplorer(cwd, officialStagePath(cwd, project.projectId, stage.id), {
								file: {
									type: "directory",
									path: officialStagePath(cwd, project.projectId, stage.id)
								},
								reveal: false
							}).catch((e) => setError(String(e.message || e)));
						}
					}, workbenchText("打开成果")) : h("button", {
						type: "button",
						className: "ap-btn",
						disabled: !!busy,
						title: workbenchText("同步成果到正式输出，并核验全部引用令牌（孤儿引用逐条列出）"),
						onClick: () => runStage(project, stage.id, "organize", false)
					}, workbenchText("成果质检并整理")), closedClean ? h("button", {
						type: "button",
						className: "ap-btn link",
						disabled: !!busy,
						title: workbenchText("再核一次盘面。已收口且无差异时不会要求再 complete_stage，也不会把商务待办写成阶段未完成。"),
						onClick: () => runStage(project, stage.id, "organize", false)
					}, busy === "organize:" + stage.id ? workbenchText("核对中…") : workbenchText("再次核对盘面")) : h("button", {
						type: "button",
						className: "ap-btn link",
						disabled: !!busy,
						title: workbenchText("跳到这一阶段。若它已是当前未完阶段，走恢复稿而不是再灌全文。"),
						onClick: () => {
							const currentUnfinished = item.currentStageId === stage.id && slice && slice.status !== "done" && tasks.length > 0;
							runStage(project, currentUnfinished ? "" : stage.id, currentUnfinished ? "resume" : "prepare", true);
						}
					}, workbenchText("进入此阶段")), h("button", {
						type: "button",
						className: "ap-btn link",
						disabled: !!busy,
						onClick: () => {
							if (!window.confirm(workbenchText("重置「") + stageLabel(stage, langState.lang) + workbenchText("」编排？任务清单会清空，磁盘成果保留。"))) return;
							runStage(project, stage.id, "reset", false);
						}
					}, workbenchText("重置编排")))));
				})), h("section", { className: "ap-sec" }, h("div", {
					className: "ap-row",
					style: { justifyContent: "space-between" }
				}, h("h2", null, workbenchText("项目资料")), h("div", { className: "ap-row" }, h("span", { className: "ap-sub" }, workbenchText("对齐原稿后点名称预览改稿；保存同步 JSON")), h("button", {
					type: "button",
					className: "ap-btn",
					disabled: !!busy || !(project.inputPaths && project.inputPaths.length),
					title: workbenchText("按知识库同一套逻辑把已登记 PDF / Word / Excel 对齐成 setup/ 解析稿"),
					onClick: () => restoreSources(project, { force: true }).catch((e) => setError(String(e.message || e))).finally(() => setBusy(""))
				}, busy === "restore" ? workbenchText("对齐中…") : workbenchText("对齐原稿")))), h("div", { className: "ap-files-list" }, !(project.inputPaths && project.inputPaths.length) ? h("p", {
					className: "ap-sub",
					style: { padding: "18px 0" }
				}, workbenchText("尚未登记资料。")) : project.inputPaths.map((path) => {
					const restore = findSetupRestore(item.restores, path);
					return h("div", {
						className: "ap-file-row",
						key: path
					}, h("button", {
						type: "button",
						className: "ap-file-link",
						title: restore ? restore.manuscriptPath : path,
						onClick: () => window.dispatchEvent(new CustomEvent("agent-pi-open-file", { detail: {
							cwd,
							path: restoreOpenPath(path, item.restores)
						} }))
					}, fileName(path)), restore ? h("span", {
						className: "ap-chip ok",
						title: restore.manuscriptPath
					}, workbenchText("已对齐")) : /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|png|jpe?g|jp2|webp|gif|bmp)$/i.test(path) ? h("span", { className: "ap-chip" }, workbenchText("待对齐")) : null);
				}))), row.workSurface ? h("section", { className: "ap-sec" }, h("div", {
					className: "ap-row",
					style: { justifyContent: "space-between" }
				}, h("h2", null, workbenchText("知识面导航与证据")), h("span", { className: "ap-sub" }, workbenchText("PageIndex 影子树只负责长文档导航；BOQ 仍以表格单元格为准"))), h("div", { className: "ap-audit" + (row.workSurface.pageIndex.fallback ? " bad" : "") }, h("div", {
					className: "ap-row",
					style: { justifyContent: "space-between" }
				}, h("span", null, workbenchText("影子树 ") + row.workSurface.pageIndex.ready + workbenchText(" 份") + (row.workSurface.pageIndex.notEligible ? " / " + row.workSurface.pageIndex.notEligible + workbenchText(" 份保持原检索") : "") + (row.workSurface.pageIndex.fallback ? " / " + row.workSurface.pageIndex.fallback + workbenchText(" 份已回退") : "")), h("span", { className: "ap-chip" }, row.workSurface.defaultNavigator ? workbenchText("默认导航") : workbenchText("影子评测"))), h("div", {
					className: "ap-row",
					style: {
						marginTop: 8,
						flexWrap: "wrap"
					}
				}, h("span", { className: "ap-sub" }, row.workSurface.coverage.initialized ? row.workSurface.coverage.ready ? workbenchText("五域覆盖：已完成") : workbenchText("五域覆盖：有未读节点/证据/结论缺口") : workbenchText("五域覆盖：等待首份长叙事资料对齐")), h("span", { className: "ap-sub" }, workbenchText("结构化证据 ") + row.workSurface.evidence.claimCount + workbenchText(" 条")), h("span", { className: "ap-sub" }, workbenchText("遥测 ") + row.workSurface.telemetry.eventCount + workbenchText(" 次"))), !row.workSurface.defaultNavigator ? h("p", {
					className: "ap-sub",
					style: { margin: "8px 0 0" }
				}, workbenchText("默认切换仍受真实项目 80–120 项评测、Route F1、定位有效率、BOQ 基线和回退测试门禁控制。")) : null)) : null, row.citationAudit ? h("section", { className: "ap-sec" }, h("div", {
					className: "ap-row",
					style: { justifyContent: "space-between" }
				}, h("h2", null, workbenchText("引用核验")), h("span", { className: "ap-sub" }, workbenchText("成果中的 [kb:…]/[src:…]/[ev:…] 令牌逐一对回知识库、项目文件与冻结证据包"))), h("div", { className: "ap-audit" + (row.citationAudit.orphans.length ? " bad" : "") }, h("div", {
					className: "ap-row",
					style: { justifyContent: "space-between" }
				}, h("span", null, row.citationAudit.orphans.length ? workbenchText("未通过：") + row.citationAudit.orphans.length + workbenchText(" 个孤儿引用 / 共 ") + row.citationAudit.totalCitations + workbenchText(" 个令牌") : row.citationAudit.totalCitations ? workbenchText("通过：") + row.citationAudit.totalCitations + workbenchText(" 个令牌全部可解析（kb ") + row.citationAudit.kbCitations + " / src " + row.citationAudit.srcCitations + " / ev " + (row.citationAudit.evidenceCitations || 0) + "）" : workbenchText("尚无引用令牌（") + row.citationAudit.checkedFiles + workbenchText(" 个成果文件）")), h("span", { className: "ap-sub" }, String(row.citationAudit.generatedAt || "").slice(0, 16).replace("T", " "))), row.citationAudit.orphans.length ? h("ul", null, row.citationAudit.orphans.slice(0, 8).map((orphan, index) => h("li", { key: index }, orphan.file + ":" + orphan.line + " " + orphan.token + " — " + orphan.reason))) : null, row.citationAudit.orphans.length > 8 ? h("p", {
					className: "ap-sub",
					style: { margin: "6px 0 0" }
				}, workbenchText("…其余 ") + (row.citationAudit.orphans.length - 8) + workbenchText(" 条见 orchestration/citation-audit.json")) : null)) : null, notice ? h("div", {
					className: "ap-sub",
					style: { padding: "10px 0 0" }
				}, notice) : null, monitorState.note && monitoringHere ? h("div", {
					className: "ap-sub",
					style: { padding: "4px 0 0" }
				}, workbenchText("监控：") + monitorState.note) : null, draft ? h("section", { className: "ap-sec" }, h("div", { className: "ap-sub" }, workbenchText("阶段稿（最近一次准备的内容；提交后由 dsh 原生 subagent / workflow 执行）")), h("div", { className: "ap-draft" }, draft)) : null);
			};
			const specialContent = module === "kb" ? h(KnowledgeBasePanel, {
				cwd,
				sessionId: pinParentSessionId() || resolveSessionId(props) || runtime.sessionId || ""
			}) : module === "archive" ? h(ArchivePanel, { onClose: props.onClose }) : module === "modules" ? h(ModuleManagerPanel, {
				cwd,
				onChanged: () => refresh(true),
				onOpened: (id) => {
					refresh(true).then(() => selectModule(id));
				},
				onDesign: (kind) => {
					const known = (data && data.modules ? data.modules : catalog).map((item) => item.id);
					const sourceRow = data && data.projects ? data.projects.find((item) => item && item.project && item.project.projectId === selectedId) : null;
					try {
						sessionStorage.setItem("ap-wb-known-modules", JSON.stringify(known));
						sessionStorage.setItem("ap-wb-await-module", "1");
					} catch {}
					setBusy("module-create");
					setError("");
					setNotice("正在进入 DSH 原生创造模式…");
					openNativeModuleCreate(props, MODULE_CREATE_PROMPTS[kind] || MODULE_CREATE_PROMPTS["custom-steps"], {
						cwd,
						module: sourceRow && sourceRow.project ? sourceRow.project.module : "",
						projectId: sourceRow && sourceRow.project ? sourceRow.project.projectId : "",
						projectRoot: sourceRow && sourceRow.project ? sourceRow.project.rootPath : cwd
					}).then(() => {
						showToast("已进入 DSH 原生创造模式；完成后模块会自动出现在专业工作台。");
						if (props.onClose) props.onClose();
					}).catch((err) => {
						try {
							sessionStorage.removeItem("ap-wb-await-module");
						} catch {}
						setError(String(err && err.message || err));
						setNotice("");
					}).finally(() => setBusy(""));
				}
			}) : null;
			if (module === "kb" ? !capabilities.knowledge : module === "archive" ? false : !capabilities.workbench) return h("div", { className: "ap-landing" }, h("p", null, tAp("wb.pluginDisabled")), h("button", {
				className: "ap-btn",
				onClick: props.onClose
			}, tAp("wb.back")));
			return h(WorkbenchView, {
				capabilities,
				cwd,
				onClose: props.onClose,
				catalog,
				module,
				current,
				onSelectModule: selectModule,
				refreshing,
				onRefresh: () => refresh(),
				onAdopt: openAdopt,
				onCreate: openCreate,
				moduleErrorCount: data && data.moduleErrors ? data.moduleErrors.length : 0,
				error,
				specialContent,
				projects,
				selectedId,
				onSelectProject: selectProject,
				overview: row ? renderOverview(row) : null,
				picking,
				pickSelected,
				onTogglePick: togglePick,
				onClosePicker: () => setPicking(false),
				onSaveFiles: saveFiles,
				busy
			});
		}
		function CreateOverlay(props) {
			useApLang();
			const sessionCwd = readWorkspaceCwd(props);
			const [open, setOpen] = react.useState(false);
			const [mode, setMode] = react.useState("create");
			const [step, setStep] = react.useState(0);
			const [module, setModule] = react.useState("tender");
			const [name, setName] = react.useState("");
			const [projectId, setProjectId] = react.useState("");
			const [idEdited, setIdEdited] = react.useState(false);
			const [folderMode, setFolderMode] = react.useState("create");
			const [selectedPath, setSelectedPath] = react.useState("");
			const [attachments, setAttachments] = react.useState([]);
			const [error, setError] = react.useState("");
			const [saving, setSaving] = react.useState(false);
			const [cwd, setCwd] = react.useState("");
			const [catalog, setCatalog] = react.useState(null);
			const [preview, setPreview] = react.useState(null);
			const reset = () => {
				setStep(0);
				setName("");
				setProjectId("");
				setIdEdited(false);
				setFolderMode("create");
				setSelectedPath("");
				setAttachments([]);
				setError("");
				setSaving(false);
				setPreview(null);
			};
			react.useEffect(() => {
				const onOpen = (event) => {
					const fromEvent = event && event.detail && event.detail.cwd;
					const nextMode = event && event.detail && event.detail.mode === "adopt" ? "adopt" : "create";
					const nextModule = event && event.detail && event.detail.module;
					if (nextModule) setModule(nextModule);
					const nextCwd = fromEvent || sessionCwd || "";
					setMode(nextMode);
					setCwd(nextCwd);
					reset();
					setOpen(true);
					api("/api/agent-pi/modules", nextCwd, { method: "GET" }).then((body) => setCatalog(body.modules || null)).catch(() => setCatalog(null));
					if (nextMode !== "adopt" || !nextCwd) return;
					setFolderMode("existing");
					setSelectedPath(nextCwd);
					const folder = fileName(nextCwd);
					setName(folder);
					setProjectId(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(folder) ? folder : slugify(folder) || folder);
					setIdEdited(true);
					api("/api/agent-pi/projects/adopt-preview" + (nextModule ? "?module=" + encodeURIComponent(nextModule) : ""), nextCwd, { method: "GET" }).then((body) => {
						setPreview(body);
						if (body.name) setName(body.name);
						if (body.projectId) setProjectId(body.projectId);
						if (Array.isArray(body.suggestedInputs)) setAttachments(body.suggestedInputs);
					}).catch(() => {});
				};
				window.addEventListener("agent-pi-open-create", onOpen);
				return () => window.removeEventListener("agent-pi-open-create", onOpen);
			}, [sessionCwd]);
			if (!open) return h("span", { style: { pointerEvents: "none" } });
			const desktop = desktopApi();
			const catalogRows = catalog || Object.values(MODULES);
			const catalogRow = catalogRows.find((item) => item.id === module) || null;
			const current = catalogRow || MODULES[module] || {
				id: module,
				labelZh: module
			};
			const workflow = catalogRow && catalogRow.workflow ? catalogRow.workflow : null;
			const normalizedId = projectId.trim() || slugify(name) || module + "-" + Date.now().toString(36);
			const adopt = mode === "adopt";
			const existingHere = (preview && preview.existing || []).find((item) => item.module === module);
			const rootPath = adopt ? cwd : selectedPath ? folderMode === "create" ? joinPath(selectedPath, normalizedId) : selectedPath : "";
			const canContinue = adopt ? step === 0 ? Boolean(module) : step === 1 ? Boolean(name.trim() && normalizedId && cwd) : true : step === 0 ? Boolean(name.trim() && normalizedId) : step === 1 ? Boolean(selectedPath) : true;
			const close = () => {
				if (!saving) {
					setOpen(false);
					reset();
				}
			};
			const finishCreated = (createdId) => {
				const parentId = pinParentSessionId();
				if (parentId) {
					rememberWorkbenchBinding(parentId, {
						cwd,
						module,
						projectId: createdId
					});
					ensureUserRequirementWatcher(parentId);
					api("/api/agent-pi/stage", cwd, {
						method: "POST",
						body: JSON.stringify({
							action: "bind_session",
							module,
							projectId: createdId,
							sessionId: parentId
						})
					}).catch((error) => showToast("项目与主会话绑定失败：" + String(error && error.message || error)));
				}
				setOpen(false);
				reset();
				try {
					sessionStorage.setItem("ap-wb-module", module);
					sessionStorage.setItem("ap-wb-project", createdId);
				} catch {}
				setWorkbenchOpen(true);
				window.dispatchEvent(new CustomEvent("agent-pi-created", { detail: {
					projectId: createdId,
					module
				} }));
			};
			const handleCreate = () => {
				if (!rootPath || saving) return;
				if (adopt && existingHere) {
					finishCreated(existingHere.projectId);
					return;
				}
				setSaving(true);
				setError("");
				const body = adopt ? {
					action: "adopt",
					module,
					name: name.trim(),
					projectId: normalizedId,
					inputPaths: attachments
				} : {
					module,
					name: name.trim(),
					projectId: normalizedId,
					rootPath,
					createDirectory: folderMode === "create",
					inputPaths: attachments
				};
				api("/api/agent-pi/projects", cwd, {
					method: "POST",
					body: JSON.stringify(body)
				}).then((created) => {
					finishCreated(created && created.project ? created.project.projectId : normalizedId);
				}).catch((e) => {
					setError(String(e.message || e));
					setSaving(false);
				});
			};
			const toggleAttach = (path, _name, forceAdd) => {
				setAttachments((currentPaths) => {
					const has = currentPaths.indexOf(path) >= 0;
					if (forceAdd && has) return currentPaths;
					if (has) return currentPaths.filter((item) => item !== path);
					return currentPaths.concat([path]);
				});
			};
			const steps = adopt ? [
				tAp("create.step.module"),
				tAp("create.step.info"),
				tAp("create.step.files"),
				tAp("create.step.confirmAdopt")
			] : [
				tAp("create.step.info"),
				tAp("create.step.folder"),
				tAp("create.step.files"),
				tAp("create.step.confirmNew")
			];
			const FALLBACK_STAGE_LABELS = {
				tender: [
					"项目资料登记",
					"招标文件解析",
					"BOQ 逐页组价与资源汇总",
					"施工策划、进度、成本与出稿"
				],
				delivery: ["实施工作区建立", "合同范围 / 进度 / 成本 / 风险"],
				investment: ["授权与工作区", "尽调与决策包"]
			};
			const stageLabels = {};
			stageLabels[module] = workflow ? workflow.stages.map((stage) => stageLabel(stage, langState.lang)) : (FALLBACK_STAGE_LABELS[module] || []).map((label) => workbenchText(label));
			const showName = adopt ? step === 1 : step === 0;
			const showFolder = !adopt && step === 1;
			const showFiles = step === 2;
			const showConfirm = step === 3;
			return h("div", {
				className: "ap-overlay",
				onClick: (e) => {
					if (e.target === e.currentTarget) close();
				}
			}, h("div", { className: "ap-modal wide" }, h("button", {
				type: "button",
				className: "ap-close",
				onClick: close,
				"aria-label": tAp("create.close")
			}, Icon("x", 16)), h("h1", null, adopt ? tAp("create.titleAdopt") : tAp("create.titleNew", { name: moduleLabel(current) })), h("p", { className: "hint" }, adopt ? tAp("create.hintAdopt") : tAp("create.hintNew")), h("div", { className: "ap-steps" }, steps.map((label, index) => h("span", {
				key: label,
				className: index === step ? "on" : ""
			}, index + 1 + ". " + label))), adopt && step === 0 ? h("div", null, h("p", { className: "ap-sub" }, tAp("create.whichModule")), h("div", {
				className: "ap-mods",
				style: {
					flexWrap: "wrap",
					marginTop: 10
				}
			}, catalogRows.filter((item) => !item.disabled).map((item) => h("button", {
				key: item.id,
				type: "button",
				className: "ap-mod" + (module === item.id ? " on" : ""),
				onClick: () => setModule(item.id)
			}, moduleIconNode(item, 15), moduleLabel(item)))), existingHere ? h("p", {
				className: "ap-sub",
				style: { marginTop: 12 }
			}, "当前工作区已是本模块项目「" + existingHere.name + "」，确认后直接打开。") : null) : null, showName ? h("div", null, h("label", null, "项目名称"), h("input", {
				value: name,
				autoFocus: true,
				placeholder: "例如：N3 公路升级投标",
				onChange: (e) => {
					const value = e.target.value;
					setName(value);
					if (!idEdited) setProjectId(slugify(value));
				}
			}), h("label", null, "项目标识"), h("input", {
				value: projectId,
				placeholder: "n3-upgrade",
				onChange: (e) => {
					setIdEdited(true);
					setProjectId(e.target.value.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 128));
				}
			}), h("p", { className: "ap-sub" }, adopt ? "默认用当前工作区文件夹名。与正式成果目录对齐后，已有 Official Outputs 会挂到本项目。" : "用于项目状态目录和会话归类，不改变实际文件名。")) : null, showFolder ? h("div", null, h("div", { className: "ap-mode" }, h("button", {
				type: "button",
				className: "ap-btn" + (folderMode === "create" ? " primary" : ""),
				onClick: () => setFolderMode("create")
			}, "新建项目文件夹"), h("button", {
				type: "button",
				className: "ap-btn" + (folderMode === "existing" ? " primary" : ""),
				onClick: () => setFolderMode("existing")
			}, "关联现有项目文件夹")), h("button", {
				type: "button",
				className: "ap-btn",
				style: {
					width: "100%",
					justifyContent: "flex-start"
				},
				onClick: () => {
					if (desktop && typeof desktop.pickFolder === "function") {
						desktop.pickFolder().then((path) => {
							if (path) setSelectedPath(path);
						});
						return;
					}
					const fallback = window.prompt(folderMode === "create" ? "上级目录绝对路径" : "现有项目目录绝对路径", selectedPath || cwd);
					if (fallback) setSelectedPath(fallback);
				}
			}, Icon("folder", 14), selectedPath || (folderMode === "create" ? "选择上级目录" : "选择现有项目目录")), !selectedPath && cwd ? h("button", {
				type: "button",
				className: "ap-btn link",
				onClick: () => setSelectedPath(cwd)
			}, "使用当前工作区：" + cwd) : null, rootPath ? h("p", { className: "ap-sub" }, "项目资料/成果目录：" + rootPath + "（阶段状态与编排数据保存在当前工作区，不写入该目录）") : null) : null, showFiles ? h(FilePickPanel, {
				cwd,
				selected: attachments,
				onToggle: toggleAttach
			}) : null, showConfirm ? h("div", { className: "ap-confirm" }, h("p", { style: { fontWeight: 600 } }, moduleLabel(current)), h("p", { className: "ap-sub" }, adopt ? existingHere ? "该工作区已登记过本模块，确认后打开已有项目。" : "不另建文件夹。已有正式成果保留；盘面从“" + ((stageLabels[module] || [])[0] || "资料登记") + "”起，不会自动改写后续阶段。" : "新项目从“" + (stageLabels[module] || [])[0] + "”开始；后续阶段在工作台切换。"), h("ol", { style: {
				paddingLeft: 18,
				margin: "10px 0"
			} }, (stageLabels[module] || []).map((label) => h("li", {
				key: label,
				style: {
					margin: "6px 0",
					paddingBottom: 6,
					borderBottom: "1px solid var(--dsw-alias-border-l2)"
				}
			}, label))), h("p", null, h("span", { className: "k" }, "项目："), name), h("p", null, h("span", { className: "k" }, "目录："), rootPath), h("p", null, h("span", { className: "k" }, "登记资料："), attachments.length + " 个"), adopt && preview && preview.officialCount ? h("p", null, h("span", { className: "k" }, "已有正式成果："), preview.officialCount + " 份（保留）") : null) : null, error ? h("div", { className: "ap-err" }, error) : null, h("div", { className: "ap-foot" }, step > 0 ? h("button", {
				type: "button",
				className: "ap-btn",
				disabled: saving,
				onClick: () => setStep((n) => n - 1)
			}, "上一步") : h("button", {
				type: "button",
				className: "ap-btn",
				disabled: saving,
				onClick: close
			}, "取消"), step < 3 ? h("button", {
				type: "button",
				className: "ap-btn primary",
				disabled: !canContinue,
				onClick: () => setStep((n) => n + 1)
			}, "下一步") : h("button", {
				type: "button",
				className: "ap-btn primary",
				disabled: saving || !rootPath,
				onClick: handleCreate
			}, saving ? adopt ? "升级中…" : "创建中…" : adopt ? existingHere ? "打开已有项目" : "升级为专业项目" : "创建项目（登记资料后再启动阶段）"))));
		}
		function replaceChildren(nodes, path, children) {
			return (nodes || []).map((node) => {
				if (node.path === path) return Object.assign({}, node, {
					children,
					childrenLoaded: true,
					hasMoreChildren: false
				});
				if (node.children) return Object.assign({}, node, { children: replaceChildren(node.children, path, children) });
				return node;
			});
		}
		const { FilePreviewOverlay, FolderPreviewOverlay, FilesPanel } = createFilePreviewOverlay({
			DocBtn,
			FileContextMenu,
			Icon,
			PREVIEW_HEAD_CHARS,
			PREVIEW_TABLE_ROW_CAP: 80,
			React: react,
			ReactDOM: react_dom,
			api,
			apiBlob,
			attachFolderPath,
			attachItemsOf,
			attachSessionId,
			buildPreviewSelectionFollowup,
			captureComposerFace,
			chooseAndUpload,
			chooseFolderForChat,
			codexTurnArmed,
			codexTurnListeners,
			currentDraft,
			dispatchToConversation,
			displayFileName,
			downloadBlob,
			escapeHtml,
			fileIconClass,
			fileIconName,
			fillComposer,
			fillMdTables,
			flattenFiles,
			foldAndSubmit,
			h,
			htmlToMarkdown,
			importWorkspaceFileToKb,
			looksLikeKbPackName,
			mdToHtml,
			mentionInChat,
			openInExplorer,
			previewIsHeavy,
			rawFileUrl,
			readDraft,
			readReasoningEffort,
			readWorkspaceCwd,
			replaceChildren,
			runtime,
			setCodexTurnArmed,
			showToast,
			slicePreviewMarkdown,
			snapshotComposer,
			snapshotFileList,
			sourceLabel,
			stitchMarkdown,
			stripComposerMentions,
			tAp,
			uploadFileList,
			useApLang,
			useAttachItems,
			wrapComposerSubmit
		});
		const TaskProcess = createTaskProcess({
			React: react,
			language: () => document.documentElement.lang?.startsWith("en") ? "en" : "zh",
			snapshot: (id) => sessionSnapshotWithChat(id, codexTurnAuthorities(id)?.session),
			subscribe: (id, listener) => subscribeSessionWithChat(id, codexTurnAuthorities(id)?.session, listener)
		});
		function TaskProcessHeader(props) {
			return h(TaskProcess, { sessionId: props.sessionId || "" });
		}
		const TaskGuide = createTaskGuide({
			React: react,
			api,
			cwd: () => snapshotComposer()?.cwd || "",
			language: () => document.documentElement.lang || "zh",
			subscribe: (id, listener) => subscribeSessionWithChat(id, codexTurnAuthorities(id)?.session, listener)
		});
		function TaskGuideView(props) {
			useApLang();
			return productCapabilities.use().taskGuide ? h(TaskGuide, {
				sessionId: props.sessionId || "",
				onClose: () => props.openView("chat", "")
			}) : h("p", null, langState.lang === "zh" ? "任务引导插件未启用。" : "Task guide plugin is not enabled.");
		}
		const ProfessionalDepth = createProfessionalDepth({
			React: react,
			api,
			useLanguage: useApLang,
			fillDraft: fillComposer,
			run: (composer, instruction) => {
				const draft = currentDraft(composer).trim();
				fillComposer(composer, draft ? `${draft}\n\n${instruction}` : instruction);
				requestAnimationFrame(() => composer.inputActions?.submit?.());
			},
			subscribe: (id, listener) => {
				return subscribeSessionWithChat(id, codexTurnAuthorities(id)?.session, listener);
			}
		});
		function MainComposerTools(props) {
			const main = props.useSessions(mainSessionId);
			return props.sessionId === main ? h(ComposerTools, props) : null;
		}
		function MainAttachmentDock(props) {
			const main = props.useSessions(mainSessionId);
			return props.sessionId === main ? h(AttachmentDock, props) : null;
		}
		function ComposerTools(props) {
			useApLang();
			captureComposerFace(props);
			const live = snapshotComposer();
			const cwd = live.cwd;
			const draft = readDraft();
			const [busy, setBusy] = react.useState(false);
			const [items, setItems] = useAttachItems();
			wrapComposerSubmit(live);
			react.useEffect(() => {
				if (items.length) stripComposerMentions(items);
			}, [items.length]);
			const propsRef = react.useRef(live);
			propsRef.current = live;
			const [, setCodexTurnTick] = react.useState(0);
			react.useEffect(() => {
				const sync = () => setCodexTurnTick((tick) => tick + 1);
				codexTurnListeners.add(sync);
				return () => {
					codexTurnListeners.delete(sync);
				};
			}, []);
			const armed = codexTurnArmed(live);
			react.useEffect(() => {
				const onFill = (event) => {
					const text = event && event.detail && event.detail.text;
					if (!text) return;
					const current = currentDraft(propsRef.current).trimEnd();
					fillComposer(propsRef.current, event.detail.append && current ? current + "\n" + text : text);
				};
				window.addEventListener("agent-pi-fill-composer", onFill);
				return () => {
					window.removeEventListener("agent-pi-fill-composer", onFill);
				};
			}, []);
			react.useEffect(() => {
				let compositionEndedAt = -Infinity;
				const onCompositionEnd = (event) => {
					if ((event.target?.closest?.("textarea, [data-composer-input]"))?.closest("[data-composer-card]")) compositionEndedAt = Date.now();
				};
				const isSendButton = (btn) => {
					if (!btn || btn.closest(".ap-row") || btn.closest(".ap-attach-host") || btn.closest(".ap-attach-rail")) return false;
					if (!btn.closest("[data-composer-card]")) return false;
					if (btn.disabled || btn.querySelector?.("svg rect")) return false;
					if (!/primary/i.test(String(btn.className || ""))) return false;
					const label = (btn.getAttribute("aria-label") || btn.textContent || "").trim();
					return !/停止|Stop|stop/i.test(label);
				};
				const onClick = (event) => {
					if (!codexTurnArmed(propsRef.current) && !codexAttachItems(attachmentTurnKey(propsRef.current)).length) return;
					if (!isSendButton(event.target.closest("button"))) return;
					event.preventDefault();
					event.stopPropagation();
					if (codexTurnArmed(propsRef.current)) {
						submitCodexTurn(propsRef.current);
						return;
					}
					foldAndSubmit(propsRef.current);
				};
				const onKeyDown = (event) => {
					if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
					if (Date.now() - compositionEndedAt < 10) return;
					if (event.altKey || event.repeat || event.keyCode === 229 || event.ctrlKey && event.metaKey || event.getModifierState?.("AltGraph")) return;
					if (!codexTurnArmed(propsRef.current) && !codexAttachItems(attachmentTurnKey(propsRef.current)).length) return;
					const input = event.target && typeof event.target.closest === "function" ? event.target.closest("textarea, [data-composer-input]") : null;
					if (!input || !input.closest("[data-composer-card]")) return;
					event.preventDefault();
					event.stopPropagation();
					if (codexTurnArmed(propsRef.current)) {
						submitCodexTurn(propsRef.current);
						return;
					}
					foldAndSubmit(propsRef.current);
				};
				document.addEventListener("click", onClick, true);
				document.addEventListener("keydown", onKeyDown, true);
				document.addEventListener("compositionend", onCompositionEnd, true);
				return () => {
					document.removeEventListener("click", onClick, true);
					document.removeEventListener("keydown", onKeyDown, true);
					document.removeEventListener("compositionend", onCompositionEnd, true);
				};
			}, []);
			const polish = () => {
				if (!cwd || !draft.trim() || busy) return;
				setBusy(true);
				api("/api/agent-pi/optimize-prompt", cwd, {
					method: "POST",
					body: JSON.stringify({
						input: draft,
						attachments: codexAttachItems(attachmentTurnKey(live)).map((item) => ({
							name: item.name,
							type: item.kind,
							size: item.size
						})),
						reasoningEffort: readReasoningEffort()
					})
				}).then((result) => {
					if (result.optimizedPrompt) fillComposer(live, result.optimizedPrompt);
					showToast(result.fallback ? workbenchText("已用本地模板润色（当前模型未响应）") : workbenchText("已用当前模型润色"));
				}).catch((err) => {
					showToast(workbenchText("润色失败：") + String(err && err.message || err));
				}).finally(() => setBusy(false));
			};
			return h("div", { className: "ap-composer-tools" }, h("div", {
				className: "ap-row",
				style: { gap: 2 }
			}, h("button", {
				type: "button",
				className: "ap-toolbtn" + (busy ? " on" : ""),
				title: busy ? workbenchText("正在用当前模型润色…") : workbenchText("用当前模型润色提示词"),
				disabled: busy || !draft.trim(),
				onMouseDown: (e) => e.preventDefault(),
				onClick: polish
			}, Icon("sparkles", 15, busy ? "ap-spin" : "")), h("button", {
				type: "button",
				className: "ap-codex-turn" + (armed ? " on" : ""),
				"aria-pressed": armed ? "true" : "false",
				title: armed ? tCodexExecution("engineCodexTitle", langState.lang) : tCodexExecution("engineDshTitle", langState.lang),
				onMouseDown: (event) => event.preventDefault(),
				onClick: () => setCodexTurnArmed(propsRef.current, !armed)
			}, Icon("sparkles", 14), armed ? "Codex" : "DSH / Codex"), armed && h(ComposerCodexModelSelector, { composer: live }), h(ProfessionalDepth, {
				key: live.sessionId || "draft",
				composer: live
			}), h("button", {
				type: "button",
				className: "ap-toolbtn",
				title: tAp("files.addFolder"),
				onMouseDown: (e) => e.preventDefault(),
				onClick: (e) => {
					e.preventDefault();
					e.stopPropagation();
					chooseFolderForChat(cwd, snapshotComposer()).catch((err) => showToast(workbenchText("加入文件夹失败：") + String(err && err.message || err)));
				}
			}, Icon("folder", 15))));
		}
		function renderAttachRail(items, onRemove) {
			return h("div", {
				className: "ap-attach-host",
				"aria-label": workbenchText("已加入对话的文件")
			}, h("div", { className: "ap-attach-rail" }, items.map((item) => h("div", {
				key: item.id || item.relativePath,
				className: "ap-attach-bubble" + (item.kind === "image" ? " image" : "") + (item.kind === "folder" ? " folder" : "") + (item.loaded === false ? " loading" : ""),
				title: item.error || item.path || item.relativePath || item.name
			}, h("button", {
				type: "button",
				className: "ap-attach-x",
				title: workbenchText("移除"),
				onClick: () => onRemove(item)
			}, Icon("x", 10)), h("div", { className: "ap-attach-thumb" }, item.loaded === false ? Icon("sparkles", 16, "ap-spin") : item.kind === "image" && item.previewUrl ? h("img", {
				src: item.previewUrl,
				alt: item.name
			}) : Icon(item.kind === "folder" ? "folder" : item.kind === "text" ? "fileText" : "file", 16)), item.kind === "image" ? null : h("div", { className: "ap-attach-meta" }, h("strong", { title: item.path || item.relativePath || item.name }, item.name))))));
		}
		function AttachmentDock(props) {
			captureComposerFace(props);
			wrapComposerSubmit(snapshotComposer());
			return null;
		}
		function ensureComposerAttachHost() {
			const card = document.querySelector("[data-composer-card]");
			if (!card) return null;
			let host = Array.prototype.find.call(card.children, (node) => node.classList && node.classList.contains("ap-attach-in-card"));
			if (!host) {
				host = document.createElement("div");
				host.className = "ap-attach-in-card";
				const official = card.querySelector("[data-slot=\"conversation.input.attachments\"]");
				if (official) official.insertAdjacentElement("afterend", host);
				else {
					const scroll = card.querySelector("[data-input-scroll]");
					if (scroll) card.insertBefore(host, scroll);
					else card.insertBefore(host, card.firstChild);
				}
			}
			return host;
		}
		function AttachmentFloat() {
			useApLang();
			const [items, setItems] = useAttachItems();
			const [host, setHost] = react.useState(null);
			react.useEffect(() => {
				const place = () => setHost(ensureComposerAttachHost());
				place();
				window.addEventListener("resize", place);
				const timer = window.setInterval(place, 400);
				return () => {
					window.removeEventListener("resize", place);
					window.clearInterval(timer);
				};
			}, [items.length]);
			if (!items.length) return null;
			const rail = renderAttachRail(items, (item) => setItems(items.filter((row) => row !== item)));
			if (host && react_dom && typeof react_dom.createPortal === "function") return react_dom.createPortal(rail, host);
			const node = h("div", {
				className: "ap-attach-float",
				style: {
					left: "50%",
					bottom: "168px",
					transform: "translateX(-50%)",
					width: "min(720px, calc(100vw - 48px))"
				}
			}, rail);
			if (react_dom && typeof react_dom.createPortal === "function") return react_dom.createPortal(node, document.body);
			return node;
		}
		function ToastHost() {
			const [text, setText] = react.useState("");
			react.useEffect(() => {
				let timer = 0;
				const onToast = (event) => {
					const next = event && event.detail && event.detail.text;
					if (!next) return;
					setText(next);
					window.clearTimeout(timer);
					timer = window.setTimeout(() => setText(""), 4800);
				};
				window.addEventListener("agent-pi-toast", onToast);
				return () => {
					window.removeEventListener("agent-pi-toast", onToast);
					window.clearTimeout(timer);
				};
			}, []);
			if (!text) return null;
			return h("div", {
				className: "ap-toast",
				role: "status"
			}, text);
		}
		function clampFilesRailWidth(px) {
			const n = Math.round(Number(px));
			if (!Number.isFinite(n) || n <= 0) return 300;
			return Math.min(560, Math.max(220, n));
		}
		function readFilesRailWidth() {
			try {
				return clampFilesRailWidth(localStorage.getItem("ap-files-width") || 300);
			} catch {
				return 300;
			}
		}
		function writeFilesRailWidth(px) {
			const next = clampFilesRailWidth(px);
			try {
				localStorage.setItem("ap-files-width", String(next));
			} catch {}
			return next;
		}
		function FilesRail(props) {
			useApLang();
			const cwd = readWorkspaceCwd(props);
			const sessionId = activeSessionId(props);
			const [open, setOpen] = react.useState(() => {
				try {
					return sessionStorage.getItem("ap-files-open") !== "0";
				} catch {
					return true;
				}
			});
			const [railWidth, setRailWidth] = react.useState(readFilesRailWidth);
			const [resizing, setResizing] = react.useState(false);
			const railWidthRef = react.useRef(railWidth);
			railWidthRef.current = railWidth;
			const setRailOpen = (next) => {
				setOpen(next);
				try {
					sessionStorage.setItem("ap-files-open", next ? "1" : "0");
				} catch {}
			};
			const startRailResize = (event) => {
				if (!open) return;
				event.preventDefault();
				event.stopPropagation();
				const startX = event.clientX;
				const startW = clampFilesRailWidth(railWidthRef.current);
				const direction = document.documentElement.dir === "rtl" ? -1 : 1;
				setResizing(true);
				document.documentElement.classList.add("ap-rail-resizing");
				const onMove = (ev) => {
					const next = clampFilesRailWidth(startW + direction * (startX - ev.clientX));
					railWidthRef.current = next;
					setRailWidth(next);
					document.documentElement.style.setProperty("--ap-files-w", next + "px");
				};
				const onUp = () => {
					window.removeEventListener("pointermove", onMove);
					window.removeEventListener("pointerup", onUp);
					document.documentElement.classList.remove("ap-rail-resizing");
					setResizing(false);
					writeFilesRailWidth(railWidthRef.current);
				};
				window.addEventListener("pointermove", onMove);
				window.addEventListener("pointerup", onUp);
			};
			const [stack, setStack] = react.useState([]);
			const preview = stack.length > 0 ? stack[stack.length - 1] : null;
			react.useEffect(() => {
				const onOpen = () => {
					if (runtime.sidebarRight?.isExpanded()) runtime.sidebarRight.toggleExpanded();
					window.dispatchEvent(new Event("agent-pi-close-native-preview"));
					setRailOpen(true);
				};
				window.addEventListener("agent-pi-open-files", onOpen);
				const onOpenFile = (event) => {
					const detail = event && event.detail;
					const path = detail && detail.path;
					if (!path) return;
					onOpen();
					setStack((prev) => {
						const top = prev.length > 0 ? prev[prev.length - 1] : null;
						if (top && top.type === "file" && top.file && top.file.path === path && (!detail.kbSlug || top.file.kbSlug === detail.kbSlug)) return prev;
						return prev.concat([{
							type: "file",
							file: {
								path,
								name: detail.name || fileName(path),
								type: "file",
								kbSlug: detail.kbSlug || "",
								kbHasSource: !!detail.kbHasSource
							}
						}]);
					});
				};
				window.addEventListener("agent-pi-open-file", onOpenFile);
				const onClosePreview = () => setStack([]);
				window.addEventListener("agent-pi-close-preview", onClosePreview);
				return () => {
					window.removeEventListener("agent-pi-open-files", onOpen);
					window.removeEventListener("agent-pi-open-file", onOpenFile);
					window.removeEventListener("agent-pi-close-preview", onClosePreview);
				};
			}, []);
			react.useEffect(() => {
				const hasWorkspace = !!(cwd || sessionId);
				const reserved = hasWorkspace ? open ? clampFilesRailWidth(railWidth) : 56 : 0;
				if (reserved) document.documentElement.style.setProperty("--ap-files-w", reserved + "px");
				else document.documentElement.style.removeProperty("--ap-files-w");
				document.documentElement.classList.toggle("ap-files-rail", hasWorkspace);
				document.documentElement.classList.toggle("ap-files-collapsed", !!(hasWorkspace && !open));
				document.documentElement.classList.toggle("ap-doc-open", !!preview);
			}, [
				cwd,
				sessionId,
				open,
				preview,
				railWidth
			]);
			react.useEffect(() => {
				return () => {
					document.documentElement.classList.remove("ap-files-rail");
					document.documentElement.classList.remove("ap-files-collapsed");
					document.documentElement.classList.remove("ap-doc-open");
					document.documentElement.style.removeProperty("--ap-files-w");
				};
			}, []);
			const openFile = react.useCallback((file, fromFolder) => {
				window.dispatchEvent(new Event("agent-pi-close-native-preview"));
				setStack(fromFolder ? [{
					type: "folder",
					file: fromFolder
				}, {
					type: "file",
					file
				}] : [{
					type: "file",
					file
				}]);
			}, []);
			const openFolder = react.useCallback((file) => {
				setStack([{
					type: "folder",
					file
				}]);
			}, []);
			const closePreview = react.useCallback(() => {
				setStack((prev) => prev.slice(0, -1));
			}, []);
			if (!cwd && !sessionId) return h("span", { style: { pointerEvents: "none" } });
			const overlay = preview && preview.type === "folder" ? h(FolderPreviewOverlay, {
				cwd,
				folder: preview.file,
				sessionProps: props,
				onClose: closePreview,
				onOpenFile: (file) => setStack((prev) => prev.concat([{
					type: "file",
					file
				}]))
			}) : preview && preview.type === "file" ? h(FilePreviewOverlay, {
				key: preview.file.kbSlug || preview.file.path,
				cwd,
				file: preview.file,
				kbSlug: preview.file.kbSlug || "",
				kbHasSource: !!preview.file.kbHasSource,
				sessionProps: props,
				onClose: closePreview,
				onDeleted: closePreview,
				onKbSaved: () => window.dispatchEvent(new Event("agent-pi-files-changed"))
			}) : null;
			const rail = h("div", {
				className: "ap-files-dock" + (open ? "" : " collapsed") + (resizing ? " resizing" : ""),
				"data-files-collapsed": open ? void 0 : "true"
			}, open ? h("div", {
				className: "ap-files-resizer",
				title: tAp("files.resize"),
				"aria-label": tAp("files.resize"),
				role: "separator",
				"aria-orientation": "vertical",
				onPointerDown: startRailResize
			}) : null, h(FilesPanel, Object.assign({}, props, {
				collapsed: !open,
				onOpenFile: openFile,
				onOpenFolder: openFolder,
				onToggle: () => {
					setRailOpen(!open);
				}
			})));
			return h(react.Fragment, null, rail, overlay);
		}
		function FilesToggle() {
			useApLang();
			return h("button", {
				type: "button",
				className: "ap-header-tool",
				title: tAp("files.title"),
				"aria-label": tAp("files.title"),
				onClick: (event) => {
					event.preventDefault();
					event.stopPropagation();
					window.dispatchEvent(new Event("agent-pi-open-files"));
				}
			}, Icon("folder", 16));
		}
		function harvestPaths(owner) {
			const data = owner && owner.turn && owner.turn.data && typeof owner.turn.data.get === "function" ? owner.turn.data.get("deliverables") : null;
			const produced = data && data.produced ? data.produced : [];
			const paths = [];
			const seen = /* @__PURE__ */ new Set();
			for (let i = 0; i < produced.length; i++) {
				const row = produced[i];
				if (!row || !row.path || seen.has(row.path)) continue;
				if (typeof owner.seq === "number" && row.seq > owner.seq) continue;
				seen.add(row.path);
				paths.push(row.path);
			}
			return paths.length ? paths : null;
		}
		function HarvestOutputs(props) {
			const cwd = props.useSessions((state) => state.byId[props.sessionId]?.cwd || "");
			const paths = harvestPaths(props) || [];
			react.useEffect(() => {
				if (!cwd || !paths.length) return;
				api("/api/agent-pi/files/harvest", cwd, {
					method: "POST",
					body: JSON.stringify({ paths })
				}).then((body) => {
					if (body && body.published) window.dispatchEvent(new Event("agent-pi-files-changed"));
				}).catch(() => {});
			}, [cwd, paths.join("|")]);
			return null;
		}
		function LanguageToggle(props) {
			const lang = useApLang();
			return h("div", {
				className: "ap-lang-host" + (props && props.wide ? "" : " rail"),
				"data-ap-place": "ap-mount-lang"
			}, props && props.wide ? h("select", {
				className: "ap-lang",
				value: lang,
				title: tAp("lang.title"),
				"aria-label": tAp("lang.title"),
				onClick: (event) => {
					event.stopPropagation();
				},
				onChange: (event) => {
					const next = localeIdOf(event.target.value);
					if (runtime.locale && typeof runtime.locale.setLocale === "function") try {
						runtime.locale.setLocale(next);
						setApLang(next);
					} catch {
						showToast(tAp("lang.switchFailed"));
					}
					else setApLang(next);
				}
			}, AP_LANGUAGE_DEFINITIONS.map((language) => h("option", {
				key: language.id,
				value: language.id
			}, language.label))) : null);
		}
		function uniqueIds(ids) {
			const out = [];
			const seen = /* @__PURE__ */ new Set();
			for (const value of Array.isArray(ids) ? ids : []) {
				const id = String(value || "").trim();
				if (!id || seen.has(id)) continue;
				seen.add(id);
				out.push(id);
			}
			return out;
		}
		function visibleArchivedSessionIds(archivedIds, forgottenIds) {
			const forgotten = new Set(uniqueIds(forgottenIds));
			return uniqueIds(archivedIds).filter((id) => !forgotten.has(id));
		}
		function archiveSessionRows(input) {
			const payload = input && typeof input === "object" ? input : {};
			const archived = visibleArchivedSessionIds(payload.archivedSessionIds, payload.forgottenSessionIds);
			const byId = payload.sessionsById && typeof payload.sessionsById === "object" ? payload.sessionsById : {};
			const workspaceOf = {};
			for (const workspace of Array.isArray(payload.workspaces) ? payload.workspaces : []) {
				if (!workspace) continue;
				const title = String(workspace.title || workspace.path || "工作区");
				for (const sessionId of uniqueIds(workspace.sessionIds)) workspaceOf[sessionId] = {
					id: String(workspace.workspaceId || ""),
					title
				};
			}
			return archived.map((sessionId) => {
				const session = byId[sessionId] || {};
				const workspace = workspaceOf[sessionId];
				return {
					sessionId,
					title: String(session.displayTitle || session.title || "未命名对话"),
					blank: !!session.blank,
					updatedAt: Number(session.updatedAt) || 0,
					workspaceId: workspace ? workspace.id : "",
					workspaceTitle: workspace ? workspace.title : tAp("archive.ungrouped")
				};
			}).sort((left, right) => right.updatedAt - left.updatedAt || left.title.localeCompare(right.title, "zh"));
		}
		function groupArchiveRows(rows) {
			const groups = [];
			const index = /* @__PURE__ */ new Map();
			for (const row of Array.isArray(rows) ? rows : []) {
				const key = String(row && row.workspaceId || "");
				if (!index.has(key)) {
					const group = {
						workspaceId: key,
						title: row && row.workspaceTitle || tAp("archive.ungrouped"),
						sessions: []
					};
					index.set(key, group);
					groups.push(group);
				}
				index.get(key).sessions.push(row);
			}
			return groups;
		}
		function workspaceActionTitle(label) {
			const text = String(label || "").trim();
			const zh = text.match(/^工作区[“"](.+)[”"]的操作$/);
			if (zh) return zh[1];
			const en = text.match(/^Workspace actions for (.+)$/);
			if (en) return en[1];
			return "";
		}
		function resolveWorkspaceByTitle(items, title, index) {
			const name = String(title || "").trim();
			if (!name) return null;
			const matches = [];
			for (const workspace of Array.isArray(items) ? items : []) {
				if (!workspace) continue;
				const label = String(workspace.title || workspace.path || "").trim();
				if (label !== name) continue;
				matches.push({
					workspaceId: String(workspace.workspaceId || ""),
					title: label,
					path: String(workspace.path || ""),
					sessionIds: uniqueIds(workspace.sessionIds)
				});
			}
			if (!matches.length) return null;
			const at = Number(index);
			if (Number.isInteger(at) && at >= 0 && at < matches.length) return matches[at];
			return matches[0];
		}
		function archivedWorkspaceGroups(input) {
			const payload = input && typeof input === "object" ? input : {};
			const archivedWs = new Set(uniqueIds(payload.archivedWorkspaceIds));
			const sessionGroups = groupArchiveRows(archiveSessionRows(payload));
			const byId = new Map(sessionGroups.map((group) => [group.workspaceId, group]));
			const out = [];
			const seen = /* @__PURE__ */ new Set();
			for (const workspace of Array.isArray(payload.workspaces) ? payload.workspaces : []) {
				if (!workspace) continue;
				const id = String(workspace.workspaceId || "");
				if (!id || !archivedWs.has(id)) continue;
				const existing = byId.get(id);
				out.push({
					workspaceId: id,
					title: String(workspace.title || workspace.path || "工作区"),
					path: String(workspace.path || ""),
					kind: "workspace",
					sessions: existing ? existing.sessions : []
				});
				seen.add(id);
			}
			for (const group of sessionGroups) {
				if (group.workspaceId && seen.has(group.workspaceId)) continue;
				out.push({
					workspaceId: group.workspaceId,
					title: group.title,
					path: "",
					kind: group.workspaceId ? "sessions" : "ungrouped",
					sessions: group.sessions
				});
			}
			return out;
		}
		function readWorkspaceListSnap() {
			const list = runtime.workspaces && runtime.workspaces.list;
			if (list && typeof list.getSnapshot === "function") return list.getSnapshot();
			return {
				items: [],
				archivedSessionIds: []
			};
		}
		function readSessionListSnap() {
			const list = runtime.sessions && runtime.sessions.list;
			if (list && typeof list.getSnapshot === "function") return list.getSnapshot();
			return {
				byId: {},
				ids: []
			};
		}
		function archiveSessionById(sessionId) {
			const workspaces = runtime.workspaces;
			if (!workspaces || typeof workspaces.archiveSession !== "function") return Promise.reject(/* @__PURE__ */ new Error("会话服务还没就绪"));
			return Promise.resolve(workspaces.archiveSession(sessionId));
		}
		function forgetSessionById(sessionId) {
			return api("/api/agent-pi/archive", "", {
				method: "POST",
				body: JSON.stringify({
					action: "forget_session",
					sessionId
				})
			});
		}
		let archiveStoreSnap = {
			forgottenSessionIds: [],
			archivedWorkspaceIds: []
		};
		let lastWorkspaceMenuButton = null;
		function rememberArchiveStore(body) {
			const next = {
				forgottenSessionIds: uniqueIds(body && body.forgottenSessionIds),
				archivedWorkspaceIds: uniqueIds(body && body.archivedWorkspaceIds)
			};
			const same = next.forgottenSessionIds.join("\0") === archiveStoreSnap.forgottenSessionIds.join("\0") && next.archivedWorkspaceIds.join("\0") === archiveStoreSnap.archivedWorkspaceIds.join("\0");
			archiveStoreSnap = next;
			hideArchivedWorkspaceGroups();
			if (!same) window.dispatchEvent(new Event("agent-pi-archive-changed"));
			return archiveStoreSnap;
		}
		function loadArchiveStore() {
			return api("/api/agent-pi/archive", "", { method: "GET" }).then((body) => rememberArchiveStore(body)).catch(() => archiveStoreSnap);
		}
		function openArchivePage() {
			try {
				sessionStorage.setItem("ap-wb-module", "archive");
			} catch {}
			window.dispatchEvent(new CustomEvent("agent-pi-wb-module", { detail: "archive" }));
			setWorkbenchOpen(true);
		}
		function workspaceActionButtons() {
			return Array.from(document.querySelectorAll("button[aria-label]")).filter((btn) => workspaceActionTitle(btn.getAttribute("aria-label")));
		}
		function resolveWorkspaceFromButton(button) {
			if (!button) return null;
			const title = workspaceActionTitle(button.getAttribute("aria-label"));
			if (!title) return null;
			const sameTitle = workspaceActionButtons().filter((btn) => workspaceActionTitle(btn.getAttribute("aria-label")) === title);
			return resolveWorkspaceByTitle(readWorkspaceListSnap().items, title, sameTitle.indexOf(button));
		}
		function hideArchivedWorkspaceGroups() {
			if (typeof document === "undefined") return;
			document.querySelectorAll("[data-ap-archived-workspace]").forEach((el) => {
				el.removeAttribute("data-ap-archived-workspace");
			});
			const archived = new Set(uniqueIds(archiveStoreSnap.archivedWorkspaceIds));
			if (!archived.size) return;
			workspaceActionButtons().forEach((button) => {
				const workspace = resolveWorkspaceFromButton(button);
				if (!workspace || !archived.has(workspace.workspaceId)) return;
				const row = button.closest("[role=\"treeitem\"]");
				const section = row && row.parentElement;
				if (!section) return;
				section.setAttribute("data-ap-archived-workspace", workspace.workspaceId);
			});
		}
		function injectWorkspaceArchiveMenu(root) {
			const scope = root && root.querySelectorAll ? root : document;
			const menus = [];
			if (scope.matches && scope.matches("[role=\"menu\"]")) menus.push(scope);
			if (scope.querySelectorAll) scope.querySelectorAll("[role=\"menu\"]").forEach((menu) => menus.push(menu));
			menus.forEach((menu) => {
				if (menu.querySelector("[data-ap-archive-workspace]")) return;
				const items = Array.from(menu.querySelectorAll("[role=\"menuitem\"]"));
				const del = items.find((el) => {
					const text = (el.textContent || "").trim();
					return text === "删除工作区" || text === "Delete workspace";
				});
				const rename = items.find((el) => {
					const text = (el.textContent || "").trim();
					return text === "重命名" || text === "Rename";
				});
				if (!del || !rename || !del.parentElement || !rename.parentElement || !del.parentElement.parentElement) return;
				const wrap = rename.parentElement.cloneNode(true);
				const btn = wrap.querySelector("[role=\"menuitem\"]");
				if (!btn) return;
				btn.setAttribute("data-ap-archive-workspace", "1");
				const spans = btn.querySelectorAll("span");
				const textSpan = spans[spans.length - 1];
				if (textSpan) textSpan.textContent = tAp("archive.workspace");
				else btn.textContent = tAp("archive.workspace");
				btn.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					archiveWorkspaceFromSidebar(resolveWorkspaceFromButton(lastWorkspaceMenuButton || document.querySelector("button[aria-expanded=\"true\"][aria-label]")));
				});
				del.parentElement.parentElement.insertBefore(wrap, del.parentElement);
			});
		}
		function archiveWorkspaceFromSidebar(workspace) {
			if (!workspace || !workspace.workspaceId) {
				showToast(tAp("archive.workspaceFailed"));
				return;
			}
			if (!window.confirm(tAp("archive.workspaceConfirm"))) return;
			window.__apViewingArchived = "";
			Promise.all(uniqueIds(workspace.sessionIds).map((id) => archiveSessionById(id).catch(() => {}))).then(() => api("/api/agent-pi/archive", "", {
				method: "POST",
				body: JSON.stringify({
					action: "mark_workspace",
					workspaceId: workspace.workspaceId
				})
			})).then((body) => {
				rememberArchiveStore(body);
				openArchivePage();
			}).catch((err) => showToast(tAp("archive.workspaceFailed") + "：" + String(err && err.message || err)));
		}
		function watchArchivedWorkspaces() {
			loadArchiveStore();
			const list = runtime.workspaces && runtime.workspaces.list;
			if (list && typeof list.subscribe === "function" && !list.__apArchiveHide) {
				list.__apArchiveHide = true;
				list.subscribe(() => hideArchivedWorkspaceGroups());
			}
		}
		function openArchivedSession(sessionId) {
			if (!sessionId || !runtime.sessions || typeof runtime.sessions.retain !== "function") {
				showToast("会话服务还没就绪");
				return;
			}
			window.__apViewingArchived = sessionId;
			setWorkbenchOpen(false);
			window.dispatchEvent(new CustomEvent("agent-pi-view-archive", { detail: { sessionId } }));
		}
		function ArchiveSession(props) {
			useApLang();
			const [busy, setBusy] = react.useState(false);
			const sessionId = props.sessionId || resolveSessionId(props);
			if (!sessionId) return null;
			return h("button", {
				type: "button",
				className: "ap-header-tool",
				title: tAp("session.archiveTitle"),
				"aria-label": tAp("session.archive"),
				disabled: busy,
				onClick: (event) => {
					event.preventDefault();
					event.stopPropagation();
					if (busy) return;
					window.__apViewingArchived = "";
					setBusy(true);
					archiveSessionById(sessionId).catch((err) => showToast(tAp("session.archiveFailed") + "：" + String(err && err.message || err))).finally(() => setBusy(false));
				}
			}, Icon("archive", 16));
		}
		function ArchivePanel(props) {
			useApLang();
			const [forgotten, setForgotten] = react.useState(() => uniqueIds(archiveStoreSnap.forgottenSessionIds));
			const [archivedWorkspaceIds, setArchivedWorkspaceIds] = react.useState(() => uniqueIds(archiveStoreSnap.archivedWorkspaceIds));
			const [tick, setTick] = react.useState(0);
			const [busy, setBusy] = react.useState("");
			react.useEffect(() => {
				api("/api/agent-pi/archive", "", { method: "GET" }).then((body) => {
					rememberArchiveStore(body);
					setForgotten(uniqueIds(body && body.forgottenSessionIds));
					setArchivedWorkspaceIds(uniqueIds(body && body.archivedWorkspaceIds));
				}).catch(() => {});
			}, [tick]);
			react.useEffect(() => {
				const refresh = () => setTick((value) => value + 1);
				const unsubs = [];
				if (runtime.workspaces && runtime.workspaces.list && typeof runtime.workspaces.list.subscribe === "function") unsubs.push(runtime.workspaces.list.subscribe(refresh));
				if (runtime.sessions && runtime.sessions.list && typeof runtime.sessions.list.subscribe === "function") unsubs.push(runtime.sessions.list.subscribe(refresh));
				window.addEventListener("agent-pi-archive-changed", refresh);
				return () => {
					unsubs.forEach((fn) => {
						try {
							fn();
						} catch {}
					});
					window.removeEventListener("agent-pi-archive-changed", refresh);
				};
			}, []);
			const workspaceSnap = readWorkspaceListSnap();
			const sessionSnap = readSessionListSnap();
			const groups = archivedWorkspaceGroups({
				archivedWorkspaceIds,
				archivedSessionIds: workspaceSnap.archivedSessionIds,
				forgottenSessionIds: forgotten,
				sessionsById: sessionSnap.byId,
				workspaces: workspaceSnap.items
			});
			const deleteArchived = (sessionId) => {
				if (!window.confirm(tAp("session.deleteConfirm"))) return;
				setBusy("del:" + sessionId);
				archiveSessionById(sessionId).catch(() => {}).then(() => forgetSessionById(sessionId)).then((body) => {
					rememberArchiveStore(body);
					if (window.__apViewingArchived === sessionId) {
						window.__apViewingArchived = "";
						window.dispatchEvent(new CustomEvent("agent-pi-view-archive", { detail: { sessionId: "" } }));
					}
					setTick((value) => value + 1);
				}).catch((err) => showToast(tAp("session.deleteFailed") + "：" + String(err && err.message || err))).finally(() => setBusy(""));
			};
			const deleteWorkspace = (workspace) => {
				if (!workspace || !workspace.workspaceId) return;
				if (!window.confirm(tAp("archive.deleteWorkspaceConfirm"))) return;
				if (!runtime.workspaces || typeof runtime.workspaces.delete !== "function") {
					showToast("工作区服务还没就绪");
					return;
				}
				setBusy("wsd:" + workspace.workspaceId);
				Promise.resolve(runtime.workspaces.delete(workspace.workspaceId)).then(() => api("/api/agent-pi/archive", "", {
					method: "POST",
					body: JSON.stringify({
						action: "forget_workspace",
						workspaceId: workspace.workspaceId
					})
				})).then((body) => {
					rememberArchiveStore(body);
					setTick((value) => value + 1);
				}).catch((err) => showToast(String(err && err.message || err))).finally(() => setBusy(""));
			};
			return h("div", { className: "ap-main" }, h("section", { className: "ap-sec" }, h("h2", null, tAp("archive.title")), h("p", { className: "ap-arch-lead" }, tAp("archive.lead")), groups.length === 0 ? h("p", { className: "ap-sub" }, tAp("archive.empty")) : groups.map((group) => h("div", {
				key: (group.kind || "group") + ":" + (group.workspaceId || "ungrouped"),
				className: "ap-arch-group"
			}, h("div", { className: "ap-arch-group-hd" }, h("h3", null, group.title + " · " + group.sessions.length + (group.kind === "sessions" ? " · " + tAp("archive.workspaceLive") : "")), group.kind === "workspace" ? h("button", {
				type: "button",
				className: "ap-btn",
				disabled: !!busy,
				onClick: () => deleteWorkspace(group)
			}, tAp("archive.deleteWorkspace")) : null), group.sessions.length === 0 ? h("p", { className: "ap-arch-empty" }, tAp("archive.workspaceEmpty")) : group.sessions.map((row) => h("div", {
				key: row.sessionId,
				className: "ap-arch-row"
			}, h("div", { className: "grow" }, h("strong", null, row.title), h("div", { className: "ap-sub" }, row.sessionId)), h("span", { className: "ap-arch-actions" }, h("button", {
				type: "button",
				className: "ap-btn primary",
				disabled: !!busy,
				onClick: () => {
					if (props.onClose) props.onClose();
					openArchivedSession(row.sessionId);
				}
			}, tAp("archive.open")), h("button", {
				type: "button",
				className: "ap-btn",
				disabled: !!busy,
				onClick: () => deleteArchived(row.sessionId)
			}, tAp("archive.delete")))))))));
		}
		function paintHeroLogo(root) {
			const scope = root && root.querySelectorAll ? root : document;
			const nodes = /* @__PURE__ */ new Set();
			scope.querySelectorAll("[data-phase=\"hero\"] div:has(> span > svg[viewBox=\"0 0 23.16 17.04\"])").forEach((el) => nodes.add(el));
			scope.querySelectorAll("[data-phase=\"hero\"] [class*=\"stack\"] > [class*=\"headline\"]:not([class*=\"Text\"])").forEach((el) => nodes.add(el));
			nodes.forEach((el) => {
				let img = el.querySelector(":scope > img.ap-hero-logo");
				if (!img) {
					img = document.createElement("img");
					img.className = "ap-hero-logo";
					img.alt = "Agent Pi DSH";
					el.insertBefore(img, el.firstChild);
				}
				if (img.getAttribute("src") !== BRAND_LOGO) img.src = BRAND_LOGO;
			});
		}
		const BRAND_LOGO = "/api/agent-pi/brand/logo.png?v=8";
		const STUDIO_LOGO = "/api/agent-pi/brand/studio.png?v=3.7.0";
		const BRAND_FAVICON = "/api/agent-pi/brand/favicon.png?v=8";
		const PRODUCT_NAME = "Agent Pi DSH";
		let placingSidebar = false;
		function sidebarParts() {
			const slot = document.querySelector("[data-slot=\"sidebar\"]");
			const root = slot && slot.firstElementChild;
			if (!root) return null;
			let logoRow = null;
			let newSession = null;
			let region = null;
			let foot = null;
			for (let i = 0; i < root.children.length; i++) {
				const el = root.children[i];
				if (el.getAttribute && el.getAttribute("data-ap-mount")) continue;
				if (el.querySelector && el.querySelector("[data-slot=\"sidebar.workspaces\"]")) {
					region = el;
					continue;
				}
				if (el.querySelector && el.querySelector("[data-slot=\"sidebar.settings\"]")) {
					foot = el;
					continue;
				}
				if (el.tagName === "BUTTON") {
					newSession = el;
					continue;
				}
				if (!logoRow) logoRow = el;
			}
			return {
				root,
				logoRow,
				newSession,
				region,
				foot
			};
		}
		function ensureMount(id) {
			let el = document.getElementById(id);
			if (!el) {
				el = document.createElement("div");
				el.id = id;
				el.className = "ap-mount";
				el.setAttribute("data-ap-mount", id);
			}
			return el;
		}
		function fillPiMount(mount) {
			if (!mount) return;
			let wrap = mount.querySelector(".ap-pi");
			if (!wrap) {
				wrap = document.createElement("div");
				wrap.className = "ap-pi";
				wrap.setAttribute("aria-label", "Always π AI studio");
				const img = document.createElement("img");
				img.src = STUDIO_LOGO;
				img.alt = "Always π AI studio";
				img.draggable = false;
				wrap.appendChild(img);
				mount.appendChild(wrap);
			}
			wrap.classList.toggle("rail", !!document.querySelector("[data-sidebar-collapsed]"));
		}
		function syncSidebarLayout() {
			if (placingSidebar || typeof document === "undefined") return;
			const parts = sidebarParts();
			if (!parts || !parts.root || !parts.logoRow || !parts.newSession) return;
			placingSidebar = true;
			try {
				const studio = ensureMount("ap-mount-studio");
				const lang = ensureMount("ap-mount-lang");
				lang.classList.add("ap-mount-lang");
				const wb = ensureMount("ap-mount-wb");
				const kb = ensureMount("ap-mount-kb");
				const archive = ensureMount("ap-mount-archive");
				const pi = ensureMount("ap-mount-pi");
				const staleSessions = document.getElementById("ap-mount-sessions");
				if (staleSessions) staleSessions.remove();
				const logoToggle = parts.logoRow.querySelector("button[class*=\"toggle\"]");
				if (lang.parentElement !== parts.logoRow) parts.logoRow.appendChild(lang);
				if (lang.style.order !== "1") lang.style.order = "1";
				if (logoToggle && logoToggle.style.order !== "2") logoToggle.style.order = "2";
				const fixed = [
					parts.logoRow,
					studio,
					wb,
					kb,
					archive,
					parts.newSession,
					parts.region,
					parts.foot
				].filter(Boolean);
				const remaining = Array.from(parts.root.children).filter((node) => !fixed.includes(node) && node !== pi && !node.hasAttribute("data-ap-mount"));
				const seq = [
					...fixed,
					...remaining,
					pi
				];
				for (let i = 0; i < seq.length; i++) if (parts.root.children[i] !== seq[i]) parts.root.insertBefore(seq[i], parts.root.children[i] || null);
				fillPiMount(pi);
			} finally {
				placingSidebar = false;
			}
		}
		function placedSidebar(Component, mountId) {
			return function PlacedSidebar(props) {
				const mount = ensureMount(mountId);
				react.useLayoutEffect(() => {
					syncSidebarLayout();
				});
				return react_dom.createPortal(h(Component, props), mount);
			};
		}
		function KnowledgeBaseNav(props) {
			useApLang();
			const capabilities = productCapabilities.use();
			const open = useWorkbenchOpen();
			const [kbOn, setKbOn] = react.useState(() => {
				try {
					return sessionStorage.getItem("ap-wb-module") === "kb";
				} catch {
					return false;
				}
			});
			react.useEffect(() => {
				const sync = () => {
					try {
						setKbOn(sessionStorage.getItem("ap-wb-module") === "kb");
					} catch {}
				};
				window.addEventListener("agent-pi-wb-module", sync);
				window.addEventListener("agent-pi-wb-module-sync", sync);
				window.addEventListener("agent-pi-wb-changed", sync);
				return () => {
					window.removeEventListener("agent-pi-wb-module", sync);
					window.removeEventListener("agent-pi-wb-module-sync", sync);
					window.removeEventListener("agent-pi-wb-changed", sync);
				};
			}, []);
			if (!capabilities.knowledge) return null;
			return h("div", {
				className: "ap-nav-host",
				"data-ap-place": "ap-mount-kb"
			}, h("button", {
				type: "button",
				className: "ap-nav" + (open && kbOn ? " on" : "") + (props.wide ? "" : " rail"),
				title: tAp("nav.kbTitle"),
				"aria-pressed": open && kbOn ? "true" : "false",
				onClick: () => {
					try {
						sessionStorage.setItem("ap-wb-module", "kb");
					} catch {}
					setKbOn(true);
					window.dispatchEvent(new CustomEvent("agent-pi-wb-module", { detail: "kb" }));
					setWorkbenchOpen(true);
				}
			}, Icon("book", 16), props.wide ? h("span", null, tAp("nav.kb")) : null));
		}
		function WorkbenchNav(props) {
			useApLang();
			const capabilities = productCapabilities.use();
			const open = useWorkbenchOpen();
			const [page, setPage] = react.useState(() => {
				try {
					return sessionStorage.getItem("ap-wb-module") || "tender";
				} catch {
					return "tender";
				}
			});
			react.useEffect(() => {
				const sync = () => {
					try {
						setPage(sessionStorage.getItem("ap-wb-module") || "tender");
					} catch {}
				};
				window.addEventListener("agent-pi-wb-module", sync);
				window.addEventListener("agent-pi-wb-module-sync", sync);
				window.addEventListener("agent-pi-wb-changed", sync);
				return () => {
					window.removeEventListener("agent-pi-wb-module", sync);
					window.removeEventListener("agent-pi-wb-module-sync", sync);
					window.removeEventListener("agent-pi-wb-changed", sync);
				};
			}, []);
			const on = open && page !== "kb" && page !== "archive" && page !== "modules";
			if (!capabilities.workbench) return null;
			return h("div", {
				className: "ap-nav-host",
				"data-ap-place": "ap-mount-wb"
			}, h("button", {
				type: "button",
				className: "ap-nav" + (on ? " on" : "") + (props.wide ? "" : " rail"),
				title: tAp("workbench.title"),
				"aria-pressed": on ? "true" : "false",
				onClick: () => {
					try {
						sessionStorage.setItem("ap-wb-module", "tender");
					} catch {}
					window.dispatchEvent(new CustomEvent("agent-pi-wb-module", { detail: "tender" }));
					setWorkbenchOpen(true);
				}
			}, Icon("layout", 16), props.wide ? h("span", null, tAp("workbench.title")) : null));
		}
		function ArchiveNav(props) {
			useApLang();
			const open = useWorkbenchOpen();
			const [on, setOn] = react.useState(() => {
				try {
					return sessionStorage.getItem("ap-wb-module") === "archive";
				} catch {
					return false;
				}
			});
			react.useEffect(() => {
				const sync = () => {
					try {
						setOn(sessionStorage.getItem("ap-wb-module") === "archive");
					} catch {}
				};
				window.addEventListener("agent-pi-wb-module", sync);
				window.addEventListener("agent-pi-wb-module-sync", sync);
				window.addEventListener("agent-pi-wb-changed", sync);
				return () => {
					window.removeEventListener("agent-pi-wb-module", sync);
					window.removeEventListener("agent-pi-wb-module-sync", sync);
					window.removeEventListener("agent-pi-wb-changed", sync);
				};
			}, []);
			return h("div", {
				className: "ap-nav-host",
				"data-ap-place": "ap-mount-archive"
			}, h("button", {
				type: "button",
				className: "ap-nav" + (open && on ? " on" : "") + (props.wide ? "" : " rail"),
				title: tAp("archive.lead"),
				"aria-pressed": open && on ? "true" : "false",
				onClick: () => {
					setOn(true);
					openArchivePage();
				}
			}, Icon("archive", 16), props.wide ? h("span", null, tAp("archive.title")) : null));
		}
		function WorkbenchOverlay(props) {
			const open = useWorkbenchOpen();
			const left = useSidebarInset();
			if (!open) return h("span", { style: { pointerEvents: "none" } });
			return h("div", {
				className: "ap-wb-page",
				style: { insetInlineStart: left + "px" }
			}, h(Workbench, Object.assign({}, props, { onClose: () => setWorkbenchOpen(false) })));
		}
		function rewriteBrandText(value) {
			return String(value || PRODUCT_NAME).replace(/DeepSeek Harness/g, PRODUCT_NAME).replace(/DSH Local Build/g, PRODUCT_NAME).replace(/Agent π/g, PRODUCT_NAME);
		}
		function installTitleAndFavicon() {
			try {
				const desc = Object.getOwnPropertyDescriptor(Document.prototype, "title");
				if (desc && desc.set && desc.get && !document.__apTitleGuard) {
					document.__apTitleGuard = true;
					Object.defineProperty(document, "title", {
						configurable: true,
						enumerable: true,
						get() {
							return desc.get.call(document);
						},
						set(v) {
							desc.set.call(document, rewriteBrandText(v));
						}
					});
				}
			} catch {}
			document.title = rewriteBrandText(document.title || PRODUCT_NAME);
			document.querySelectorAll("link[rel*=\"icon\"]").forEach((el) => {
				if (el.getAttribute("href") !== BRAND_FAVICON) el.remove();
			});
			if (!document.querySelector(`link[rel="icon"][href="${BRAND_FAVICON}"]`)) {
				const link = document.createElement("link");
				link.rel = "icon";
				link.type = "image/svg+xml";
				link.href = BRAND_FAVICON;
				document.head.appendChild(link);
			}
		}
		function scrubDeepSeekLabels(root) {
			if (!root || root.nodeType !== 1) return;
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			const nodes = [];
			while (walker.nextNode()) nodes.push(walker.currentNode);
			nodes.forEach((node) => {
				if (node.nodeValue && /DeepSeek Harness|DSH Local Build/.test(node.nodeValue)) node.nodeValue = rewriteBrandText(node.nodeValue);
			});
		}
		function syncSplashState() {
			const hero = document.querySelector("[data-phase=\"hero\"]");
			const ta = hero && hero.querySelector("textarea");
			const waiting = !ta || /选择一个工作区开始|Choose a workspace to start/.test(ta.placeholder || "");
			document.documentElement.classList.toggle("ap-waiting-workspace", !!(hero && waiting));
		}
		function shortPluginName(moduleName) {
			const raw = String(moduleName || "");
			return (raw.startsWith("@") ? raw.slice(raw.indexOf("/") + 1) : raw).replace(/^cordis:/, "").replace(/^cordis-plugin-/, "").replace(/^dsh-(?:host-|client-)?/, "") || raw;
		}
		function hideVisionDupNode(node, kind) {
			if (!node || node.getAttribute("data-ap-hidden-vision-dup")) return;
			node.setAttribute("data-ap-hidden-vision-dup", kind);
			node.setAttribute("hidden", "");
			node.setAttribute("aria-hidden", "true");
			node.style.display = "none";
		}
		function isHiddenVisionModelsAlias(text) {
			const sample = String(text || "").replace(/\s+/g, " ");
			return /视觉路由\s*[（(]自动识图[)）]/.test(sample) || /Vision Router \(auto image understanding\)/i.test(sample) || /DeepSeek \+ 自动识图/.test(sample) || /DeepSeek \+ Auto Vision/i.test(sample);
		}
		function isRetiredVisionNavLabel(text) {
			const sample = String(text || "").replace(/\s+/g, " ").trim();
			return /^Vision Router\b/i.test(sample) || /^视觉路由/.test(sample) || /^vision-router$/i.test(sample);
		}
		function hideRetiredVisionSettingsNav(scope) {
			const root = scope && scope.querySelectorAll ? scope : document;
			const dialogs = root.querySelectorAll("[role=\"dialog\"]");
			const hosts = dialogs.length ? dialogs : [root];
			for (let d = 0; d < hosts.length; d++) {
				const host = hosts[d];
				if (!host || !host.querySelectorAll) continue;
				const buttons = host.querySelectorAll("nav button");
				let hiddenActive = false;
				for (let i = 0; i < buttons.length; i++) {
					const btn = buttons[i];
					if (!isRetiredVisionNavLabel(btn.textContent)) continue;
					hiddenActive = hiddenActive || btn.getAttribute("aria-current") === "true" || /\bactive\b/i.test(String(btn.className || ""));
					hideVisionDupNode(btn, "nav");
				}
				if (!hiddenActive) continue;
				for (let i = 0; i < buttons.length; i++) {
					const other = buttons[i];
					if (other.getAttribute("data-ap-hidden-vision-dup")) continue;
					other.click();
					break;
				}
			}
		}
		function hideRedundantVisionSettings(root) {
			hideRetiredVisionSettingsNav(root);
			const cards = (root && root.querySelectorAll ? root : document).querySelectorAll(".vr-card, [data-plugin-entry], li");
			for (let i = 0; i < cards.length; i++) {
				const card = cards[i];
				const text = card.textContent || "";
				const entry = String(card.getAttribute("data-plugin-entry") || "");
				if (!(/dsh-vision-router/i.test(entry) || /Vision Router 设置已迁移|Vision Router settings moved/.test(text) || /Vision Router/i.test(text) && /vision_describe|vision_ocr|stealth/i.test(text))) continue;
				hideVisionDupNode(card.closest && card.closest("li") || card, "plugin");
			}
			const markers = document.querySelectorAll("p, h2");
			for (let i = 0; i < markers.length; i++) {
				const title = (markers[i].textContent || "").trim();
				if (title !== "填入各提供方的 API 密钥即可使用其模型" && title !== "Enter your API keys to use models from the following providers.") continue;
				const section = markers[i].parentElement;
				if (!section) continue;
				const rows = section.querySelectorAll("li");
				for (let j = 0; j < rows.length; j++) if (isHiddenVisionModelsAlias(rows[j].textContent)) hideVisionDupNode(rows[j], "models");
				const options = section.querySelectorAll("option");
				for (let j = 0; j < options.length; j++) {
					const opt = options[j];
					const value = String(opt.value || "");
					if (value === "deepseek-vision" || value === "vision-router" || isHiddenVisionModelsAlias(opt.textContent)) {
						opt.hidden = true;
						opt.disabled = true;
						opt.setAttribute("data-ap-hidden-vision-dup", "models");
					}
				}
			}
		}
		function paintPluginNames(root) {
			(root && root.querySelectorAll ? root : document).querySelectorAll("[data-plugin-entry]").forEach((card) => {
				const strong = card.querySelector("strong");
				if (!strong) return;
				const title = strong.getAttribute("title") || card.getAttribute("data-plugin-entry") || "";
				if (!String(strong.textContent || "").trim() && title) strong.textContent = shortPluginName(title);
				strong.style.setProperty("color", "#111827", "important");
				strong.style.setProperty("-webkit-text-fill-color", "#111827", "important");
				strong.style.setProperty("font-size", "14px", "important");
				strong.style.setProperty("opacity", "1", "important");
				strong.style.setProperty("visibility", "visible", "important");
				strong.style.setProperty("display", "block", "important");
				strong.style.setProperty("flex", "1 1 auto", "important");
				strong.style.setProperty("min-width", "48px", "important");
			});
		}
		function installSimpleNav() {
			document.documentElement.classList.add("ap-simple-nav");
			document.documentElement.classList.remove("ap-split-nav", "ap-split-collapsed");
			syncSidebarLayout();
		}
		if (typeof document !== "undefined") {
			document.querySelectorAll(".ap-hero-rebrand, .ap-brand-top, .ap-brand-mark").forEach((el) => el.remove());
			document.documentElement.classList.toggle("ap-wb-open", readWorkbenchOpen());
			installTitleAndFavicon();
			installSimpleNav();
			syncSplashState();
			paintPluginNames(document);
			paintHeroLogo(document);
			hideRedundantVisionSettings(document);
			new MutationObserver((records) => {
				let touchedShell = false;
				for (const rec of records) {
					if (rec.type === "characterData" && rec.target.nodeValue && /DeepSeek Harness|DSH Local Build/.test(rec.target.nodeValue)) {
						if (!isInsideApDoc(rec.target)) {
							rec.target.nodeValue = rewriteBrandText(rec.target.nodeValue);
							touchedShell = true;
						}
					}
					if (rec.addedNodes && rec.addedNodes.length) rec.addedNodes.forEach((node) => {
						if (node.nodeType !== 1 || isInsideApDoc(node)) return;
						touchedShell = true;
						scrubDeepSeekLabels(node);
						paintPluginNames(node);
						paintHeroLogo(node);
						hideRedundantVisionSettings(node);
						injectWorkspaceArchiveMenu(node);
					});
				}
				hideArchivedWorkspaceGroups();
				if (!touchedShell) return;
				syncSplashState();
				syncSidebarLayout();
				paintPluginNames(document);
				paintHeroLogo(document);
				hideRedundantVisionSettings(document);
				injectWorkspaceArchiveMenu(document);
			}).observe(document.documentElement, {
				childList: true,
				subtree: true,
				characterData: true
			});
			document.addEventListener("pointerdown", (event) => {
				const btn = event.target && event.target.closest && event.target.closest("button[aria-label]");
				if (!btn || !workspaceActionTitle(btn.getAttribute("aria-label"))) return;
				lastWorkspaceMenuButton = btn;
			}, true);
			loadArchiveStore();
			hideArchivedWorkspaceGroups();
			injectWorkspaceArchiveMenu(document);
		}
		function useCodexStatus() {
			const desktop = window.agentPiDesktop;
			const [auth, setAuth] = react.useState({
				available: true,
				state: "checking"
			});
			const [refreshing, setRefreshing] = react.useState(false);
			const latestRequest = react.useRef(0);
			const refresh = react.useCallback(async () => {
				const request = ++latestRequest.current;
				setRefreshing(true);
				try {
					const next = desktop && typeof desktop.codexAuthStatus === "function" ? await desktop.codexAuthStatus() : {
						available: false,
						state: "unavailable"
					};
					if (request === latestRequest.current) setAuth(next);
				} catch {
					if (request === latestRequest.current) setAuth({
						available: false,
						state: "unavailable"
					});
				} finally {
					if (request === latestRequest.current) setRefreshing(false);
				}
			}, [desktop]);
			react.useEffect(() => {
				refresh();
				window.addEventListener("agent-pi-codex-model-changed", refresh);
				return () => {
					latestRequest.current += 1;
					window.removeEventListener("agent-pi-codex-model-changed", refresh);
				};
			}, [refresh]);
			return {
				auth,
				setAuth,
				refresh,
				refreshing
			};
		}
		function ComposerCodexModelSelector({ composer }) {
			const { auth, refresh, refreshing } = useCodexStatus();
			const zh = useApLang() === "zh";
			const controller = codexTurnController(composer, false);
			const selectedModel = controller && controller.selectedModel || "";
			const selectedEffort = controller && controller.selectedReasoningEffort || "";
			const models = auth.models || [];
			const model = auth.model;
			const turnModel = codexTurnModel(auth, selectedModel);
			const efforts = turnModel && turnModel.supportedReasoningEfforts || [];
			const inheritedEffort = codexSupportsEffort(turnModel, auth.selectedReasoningEffort) ? auth.selectedReasoningEffort : turnModel && turnModel.defaultReasoningEffort;
			const inheritedLabel = auth.selectedReasoningEffort && !codexSupportsEffort(turnModel, auth.selectedReasoningEffort) ? zh ? "使用本模型默认" : "Use this model’s default" : zh ? "跟随设置" : "Use saved setting";
			const defaultLabel = model && (model.displayName || model.id) || auth.defaultModel;
			const locked = codexTurnPhase(composer) !== "armed";
			return h("span", { className: "ap-codex-model-control" }, h("select", {
				className: "ap-codex-model-select",
				"aria-label": zh ? "本次 Codex 模型" : "Codex model for this message",
				title: zh ? "仅用于下一条 Codex 执行消息" : "Applies only to the next Codex message",
				value: selectedModel,
				disabled: locked || refreshing || auth.state !== "logged-in" || !models.length,
				onChange: (event) => setCodexTurnModel(composer, event.target.value, auth)
			}, h("option", { value: "" }, refreshing ? zh ? "正在读取模型…" : "Loading models…" : (zh ? "默认模型" : "Default model") + (defaultLabel ? " · " + defaultLabel : "")), selectedModel && !models.some((entry) => entry.id === selectedModel) && h("option", {
				value: selectedModel,
				disabled: true
			}, selectedModel + (zh ? "（不可用）" : " (unavailable)")), models.map((entry) => h("option", {
				key: entry.id,
				value: entry.id
			}, entry.displayName || entry.id))), h("select", {
				className: "ap-codex-model-select",
				"aria-label": zh ? "本次 Codex 思考等级" : "Codex reasoning effort for this message",
				title: zh ? "仅用于下一条 Codex 执行消息；未选择时使用与本次模型兼容的默认等级" : "Applies to the next Codex message; otherwise use a compatible default effort",
				value: selectedEffort,
				disabled: locked || refreshing || auth.state !== "logged-in" || !efforts.length,
				onChange: (event) => setCodexTurnReasoningEffort(composer, event.target.value)
			}, h("option", { value: "" }, inheritedLabel + (inheritedEffort ? " · " + inheritedEffort : "")), selectedEffort && !codexSupportsEffort(turnModel, selectedEffort) && h("option", {
				value: selectedEffort,
				disabled: true
			}, selectedEffort + (zh ? "（不可用）" : " (unavailable)")), efforts.map((entry) => h("option", {
				key: entry.reasoningEffort,
				value: entry.reasoningEffort,
				title: entry.description
			}, entry.reasoningEffort))), !refreshing && (!models.length || auth.modelError) && h("button", {
				type: "button",
				className: "ap-toolbtn",
				disabled: locked,
				title: auth.modelError || (zh ? "登录后刷新 Codex 模型" : "Sign in, then refresh Codex models"),
				onClick: () => {
					refresh();
				}
			}, zh ? "刷新模型" : "Refresh models"));
		}
		function SearchSettingsSection() {
			const locale = useApLang();
			return h(SearchSettings, {
				operations: react.useMemo(() => createSearchSettingsOperations(runtime.remote, api), [runtime.remote]),
				locale
			});
		}
		function CodexSettingsSection() {
			const desktop = window.agentPiDesktop;
			const zh = useApLang() === "zh";
			const { auth, setAuth, refresh, refreshing } = useCodexStatus();
			const [busy, setBusy] = react.useState(false);
			const [modelBusy, setModelBusy] = react.useState(false);
			const [modelMessage, setModelMessage] = react.useState("");
			const compactionBridgeAvailable = !!desktop && typeof desktop.compactionFallbackStatus === "function" && typeof desktop.setCompactionFallback === "function";
			const [compactionEnabled, setCompactionEnabled] = react.useState(true);
			const lastConfirmedCompaction = react.useRef(true);
			const [compactionBusy, setCompactionBusy] = react.useState(compactionBridgeAvailable);
			const [compactionMessage, setCompactionMessage] = react.useState("");
			react.useEffect(() => {
				if (auth.state !== "pending") return void 0;
				const timer = setInterval(() => {
					refresh();
				}, 2e3);
				return () => clearInterval(timer);
			}, [auth.state, refresh]);
			const loadCompaction = react.useCallback(async () => {
				if (!compactionBridgeAvailable) {
					setCompactionBusy(false);
					return;
				}
				setCompactionBusy(true);
				setCompactionMessage("");
				try {
					const result = await desktop.compactionFallbackStatus();
					if (!result || typeof result.enabled !== "boolean") throw new Error("Invalid compaction preference");
					lastConfirmedCompaction.current = result.enabled;
					setCompactionEnabled(result.enabled);
				} catch {
					setCompactionEnabled(lastConfirmedCompaction.current);
					setCompactionMessage(zh ? "无法读取自动压缩设置，请重试。" : "Could not load the compaction setting. Please retry.");
				} finally {
					setCompactionBusy(false);
				}
			}, [
				compactionBridgeAvailable,
				desktop,
				zh
			]);
			react.useEffect(() => {
				loadCompaction();
			}, [loadCompaction]);
			const invoke = async (method) => {
				setBusy(true);
				try {
					setAuth(await desktop[method]());
					window.dispatchEvent(new Event("agent-pi-codex-model-changed"));
				} catch {
					setAuth({
						available: true,
						state: "error"
					});
				} finally {
					setBusy(false);
				}
			};
			const saveModel = async (modelId) => {
				if (modelBusy || !desktop || typeof desktop.codexSetDefaultModel !== "function") return;
				setModelBusy(true);
				setModelMessage("");
				try {
					const next = await desktop.codexSetDefaultModel(modelId || null);
					if (!next || next.state !== "logged-in") throw new Error("Invalid Codex model preference");
					setAuth(next);
					setModelMessage(zh ? "默认模型已保存，下次 Codex 调用生效。" : "Default model saved for the next Codex call.");
					window.dispatchEvent(new Event("agent-pi-codex-model-changed"));
				} catch {
					setModelMessage(zh ? "模型保存失败，请刷新列表后重试。" : "Could not save the model. Refresh the list and retry.");
				} finally {
					setModelBusy(false);
				}
			};
			const saveReasoningEffort = async (effort) => {
				if (modelBusy || !desktop || typeof desktop.codexSetDefaultReasoningEffort !== "function") return;
				setModelBusy(true);
				setModelMessage("");
				try {
					const next = await desktop.codexSetDefaultReasoningEffort(effort || null);
					if (!next || next.state !== "logged-in") throw new Error("Invalid Codex reasoning preference");
					setAuth(next);
					setModelMessage(zh ? "默认思考等级已保存，下次 Codex 调用生效。" : "Default reasoning effort saved for the next Codex call.");
					window.dispatchEvent(new Event("agent-pi-codex-model-changed"));
				} catch {
					setModelMessage(zh ? "思考等级保存失败，请刷新列表后重试。" : "Could not save the reasoning effort. Refresh the list and retry.");
				} finally {
					setModelBusy(false);
				}
			};
			const saveCompaction = async () => {
				if (!compactionBridgeAvailable || compactionBusy) return;
				const nextEnabled = !compactionEnabled;
				setCompactionBusy(true);
				setCompactionEnabled(nextEnabled);
				setCompactionMessage("");
				try {
					const result = await desktop.setCompactionFallback(nextEnabled);
					if (!result || typeof result.enabled !== "boolean" || typeof result.restartRequired !== "boolean") throw new Error("Invalid compaction preference");
					lastConfirmedCompaction.current = result.enabled;
					setCompactionEnabled(result.enabled);
					setCompactionMessage(result.restartRequired ? zh ? "重启应用后生效" : "Restart the app to apply" : "");
				} catch {
					setCompactionEnabled(lastConfirmedCompaction.current);
					setCompactionMessage(zh ? "保存失败，请重试。" : "Could not save the setting. Please retry.");
				} finally {
					setCompactionBusy(false);
				}
			};
			const labels = zh ? {
				checking: "正在检查",
				"logged-in": "已通过 ChatGPT 登录",
				pending: "等待浏览器授权",
				"logged-out": "未登录",
				error: "登录未完成",
				unavailable: "Codex 运行时不可用"
			} : {
				checking: "Checking",
				"logged-in": "Signed in with ChatGPT",
				pending: "Waiting for browser authorization",
				"logged-out": "Not signed in",
				error: "Sign-in did not complete",
				unavailable: "Codex runtime unavailable"
			};
			const loggedIn = auth.state === "logged-in";
			const pending = auth.state === "pending";
			const statusClass = loggedIn ? "ap-chip ok" : pending ? "ap-chip live" : "ap-chip warn";
			const model = loggedIn && auth.model;
			const formatCapacity = (value) => Number(value).toLocaleString();
			const capacitySource = zh ? {
				provider: "供应商返回",
				official: "官方参数",
				estimated: "估算参数"
			} : {
				provider: "Provider metadata",
				official: "Verified catalog",
				estimated: "Conservative estimate"
			};
			return h("section", { className: "ap-codex-settings" }, h("h1", null, zh ? "Codex 智能体" : "Codex Agent"), h("p", { className: "ap-codex-lead" }, zh ? "在主对话选择 DSH 或 Codex 执行当前任务。Codex 直接与你交流，并复用同一套专业模块、任务依据和成果。" : "Choose DSH or Codex as the task executor in the main conversation. Codex communicates directly with you and shares the professional modules, task basis, and deliverables."), h("div", { className: "ap-codex-card" }, h("div", { className: "ap-codex-status" }, h("strong", null, "ChatGPT / Codex"), h("span", { className: statusClass }, labels[auth.state] || auth.state)), h("p", { className: "ap-sub" }, zh ? "使用 ChatGPT 账号在系统浏览器中授权，无需 API Key。凭据仅保存在本机 Agent Pi 专属 Codex 目录。" : "Authorize with your ChatGPT account in the system browser. No API key is required; credentials stay in Agent Pi’s private local Codex directory."), loggedIn && h("div", { className: "ap-codex-model-setting" }, h("label", { htmlFor: "ap-codex-default-model" }, zh ? "默认 Codex 模型" : "Default Codex model"), h("select", {
				id: "ap-codex-default-model",
				className: "ap-codex-model-select",
				value: auth.selectedModel || "",
				disabled: modelBusy || refreshing || !(auth.models || []).length || typeof desktop.codexSetDefaultModel !== "function",
				onChange: (event) => {
					saveModel(event.target.value);
				}
			}, h("option", { value: "" }, zh ? "跟随 Codex 推荐模型" : "Use the Codex recommended model"), auth.selectedModel && !(auth.models || []).some((entry) => entry.id === auth.selectedModel) && h("option", {
				value: auth.selectedModel,
				disabled: true
			}, auth.selectedModel + (zh ? "（不可用）" : " (unavailable)")), (auth.models || []).map((entry) => h("option", {
				key: entry.id,
				value: entry.id
			}, entry.displayName || entry.id))), h("label", { htmlFor: "ap-codex-default-reasoning" }, zh ? "默认 Codex 思考等级" : "Default Codex reasoning effort"), h("select", {
				id: "ap-codex-default-reasoning",
				className: "ap-codex-model-select",
				value: auth.selectedReasoningEffort || "",
				disabled: modelBusy || refreshing || !model || typeof desktop.codexSetDefaultReasoningEffort !== "function",
				onChange: (event) => {
					saveReasoningEffort(event.target.value);
				}
			}, h("option", { value: "" }, (zh ? "跟随模型默认" : "Use the model default") + (model && model.defaultReasoningEffort ? " · " + model.defaultReasoningEffort : "")), auth.selectedReasoningEffort && !codexSupportsEffort(model, auth.selectedReasoningEffort) && h("option", {
				value: auth.selectedReasoningEffort,
				disabled: true
			}, auth.selectedReasoningEffort + (zh ? "（不可用）" : " (unavailable)")), (model && model.supportedReasoningEfforts || []).map((entry) => h("option", {
				key: entry.reasoningEffort,
				value: entry.reasoningEffort,
				title: entry.description
			}, entry.reasoningEffort))), h("p", { className: "ap-sub" }, zh ? "用于 Codex 主执行和辅助子智能体；主对话选择 Codex 后可指定模型和思考等级，并连续多轮执行。切换默认模型会清除不兼容的已保存等级。" : "Used by Codex main execution and auxiliary subagents. Select Codex in the main conversation to choose a model and reasoning effort for continued tasks. Changing the default model clears an incompatible saved effort."), (auth.modelError || auth.reasoningEffortError || modelMessage) && h("p", {
				className: "ap-sub",
				role: "status"
			}, auth.modelError || auth.reasoningEffortError || modelMessage)), loggedIn && h("p", { className: "ap-sub" }, model ? [
				h("strong", { key: "id" }, model.id),
				h("br", { key: "break" }),
				zh ? "上下文窗口：" : "Context window: ",
				formatCapacity(model.contextWindow),
				" · ",
				capacitySource[model.contextWindowSource],
				h("br", { key: "output-break" }),
				zh ? "最大输出：" : "Maximum output: ",
				formatCapacity(model.maxTokens),
				" · ",
				capacitySource[model.maxTokensSource]
			] : zh ? "模型信息暂不可用" : "Model information is temporarily unavailable"), h("div", {
				className: "ap-row",
				style: { marginTop: 14 }
			}, !loggedIn && h("button", {
				type: "button",
				className: "ap-btn primary",
				disabled: busy || pending || !auth.available,
				onClick: () => {
					invoke("codexAuthLogin");
				}
			}, pending ? zh ? "等待授权…" : "Waiting…" : zh ? "使用 ChatGPT 登录" : "Sign in with ChatGPT"), h("button", {
				type: "button",
				className: "ap-btn",
				disabled: busy || refreshing || modelBusy,
				onClick: () => {
					refresh();
				}
			}, zh ? "刷新状态" : "Refresh"), loggedIn && h("button", {
				type: "button",
				className: "ap-btn warn",
				disabled: busy,
				onClick: () => {
					if (window.confirm(zh ? "确认退出 Agent Pi 的 Codex 登录？" : "Sign out of Codex in Agent Pi?")) invoke("codexAuthLogout");
				}
			}, zh ? "退出登录" : "Sign out")), h("p", { className: "ap-codex-note" }, zh ? "登录后，DSH 智能体可按需调用 " : "After sign-in, DSH agents can invoke ", h("code", null, "subagent_codex"), zh ? "。Codex 不会自动继承父对话或知识库，父智能体会把所需文件路径、知识和交付目标整理成独立任务。" : ". Codex does not inherit parent conversation or knowledge automatically, so the parent provides a self-contained brief.")), h("div", {
				className: "ap-codex-card",
				style: { marginTop: 14 }
			}, h("div", { className: "ap-codex-status" }, h("strong", null, zh ? "对话自动压缩" : "Automatic conversation compaction"), h("button", {
				type: "button",
				role: "switch",
				className: "ap-switch" + (compactionEnabled ? " on" : ""),
				"aria-label": zh ? "DeepSeek 摘要兜底" : "DeepSeek summary fallback",
				"aria-checked": compactionEnabled ? "true" : "false",
				disabled: compactionBusy || !compactionBridgeAvailable,
				onClick: () => {
					saveCompaction();
				}
			}, h("span", { className: "ap-switch-knob" }))), h("p", { className: "ap-sub" }, zh ? "当上下文用量达到约 72% 时自动压缩，先尝试当前会话模型。启用兜底后，如果主摘要发生可兜底的失败，旧对话历史可能会发送给 deepseek-flash；这可能产生一次 DeepSeek 调用费用，并会跨供应商处理该段历史。" : "Automatic compaction starts near 72% context usage and tries the current session model first. When fallback is enabled and the primary summary has an eligible failure, older conversation history may be sent to deepseek-flash. This may create one DeepSeek charge and processes that history across provider boundaries."), !compactionBridgeAvailable && h("p", { className: "ap-sub" }, zh ? "此设置仅在打包的桌面应用中可用。" : "This setting is available only in the packaged desktop app."), compactionMessage && h("p", { className: "ap-sub" }, compactionMessage)), h(AgentTeamsSettings, {
				desktop,
				zh
			}));
		}
		function StudioCredit(props) {
			const zh = useApLang() === "zh";
			if (!props.wide) return h("span", {
				"data-ap-place": "ap-mount-studio",
				style: { display: "none" }
			});
			return h("div", {
				className: "ap-studio",
				"data-ap-place": "ap-mount-studio",
				title: zh ? "由 Always π AI studio 独立开发和维护" : "Independently developed and maintained by Always π AI studio"
			}, "Always π AI studio");
		}
		function SidebarBrandMark(props) {
			const size = Number(props && props.size) || 24;
			return h("img", {
				src: "/api/agent-pi/brand/symbol.png?v=8",
				alt: "",
				width: size,
				height: size,
				draggable: false,
				style: {
					width: size,
					height: size,
					objectFit: "contain"
				}
			});
		}
		function SidebarBrandName() {
			return h("span", { className: "ap-sidebar-brand-name" }, "Agent Pi DSH");
		}
		function HeroBrandMark(props) {
			const size = Number(props && props.size) || 34;
			return h("img", {
				className: props && props.className || "ap-hero-logo",
				src: BRAND_LOGO,
				alt: "Agent Pi DSH",
				width: size,
				height: size,
				draggable: false,
				style: {
					width: size,
					height: "auto",
					maxHeight: 188,
					objectFit: "contain"
				}
			});
		}
		const name = "tender-web";
		const inject = [
			"slots",
			"workspaces",
			"remote",
			"remote.credentials",
			"remote.agentPresets",
			"remote.session"
		];
		window.__apAttachItems = attachItemsToComposer;
		if (!window.__apAttachFileBound) {
			window.__apAttachFileBound = true;
			window.addEventListener("agent-pi-attach-file", (event) => {
				const detail = event && event.detail;
				if (!detail || !detail.items) return;
				const write = window.__apAttachItems;
				if (typeof write === "function") write(detail.sessionProps || composerPropsRef.current, detail.items, detail.source);
			});
		}
		function apply(ctx) {
			ctx.effect(() => productCapabilities.install());
			ctx.effect(() => () => nativeCodex.dispose());
			installAttachmentMessageView(ctx, react);
			installArchiveSessionView(ctx, {
				React: react,
				useLanguage: useApLang
			});
			installNativeWorkFilePreviews(ctx, {
				React: react,
				ReactDOM: react_dom,
				FilePreviewOverlay
			});
			ctx.inject(["sidebarRight"], (scope) => {
				runtime.sidebarRight = scope.sidebarRight;
				scope.on("dispose", () => {
					runtime.sidebarRight = void 0;
				});
			});
			runtime.workspaces = ctx.workspaces || runtime.workspaces;
			runtime.remote = ctx.remote || runtime.remote;
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "agent-pi-anysearch",
				order: 16,
				label: () => searchSettingsText(langState.lang, "title")
			}, SearchSettingsSection));
			watchArchivedWorkspaces();
			ctx.inject(["sessions"], (scope) => {
				runtime.sessions = scope.sessions || ctx.sessions || (typeof scope.get === "function" ? scope.get("sessions") : null) || runtime.sessions;
				const stopKbSelection = installKbSessionBridge(runtime.sessions, {
					claimDraftKbTask,
					resetDraftKbTask,
					kbDraftKey
				}, (sessionId) => {
					runtime.sessionId = sessionId;
					composerFace.sessionId = sessionId;
					composerFace.inputActions = null;
					composerFace.session = null;
					composerFace.draft = "";
					composerFace.input = { draft: "" };
					if (!sessionId) {
						runtime.cwd = "";
						composerFace.cwd = "";
						composerFace.draft = "";
						composerFace.input = { draft: "" };
					}
				});
				scope.on("dispose", stopKbSelection);
				watchWorkbenchTransactionRestore();
				ensureUserRequirementWatcher(runtime.sessionId);
			});
			ctx.inject(["sessions", "uiWorkspace"], (scope) => {
				runtime.uiWorkspace = scope.uiWorkspace || ctx.uiWorkspace;
				scope.on("dispose", installKbWorkspaceBridge(scope.sessions || runtime.sessions, runtime.uiWorkspace, {
					claimDraftKbTask,
					kbDraftKey
				}));
			});
			ctx.inject(["conversation"], (scope) => {
				runtime.conversation = scope.conversation || ctx.conversation || (typeof scope.get === "function" ? scope.get("conversation") : null) || runtime.conversation;
			});
			ctx.inject(["uiConversation"], (scope) => {
				runtime.uiConversation = scope.uiConversation || ctx.uiConversation || (typeof scope.get === "function" ? scope.get("uiConversation") : null) || runtime.uiConversation;
			});
			ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "agent-pi-codex-main",
				order: 30,
				label: "Codex"
			}, nativeCodex.View));
			ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "workbench",
				order: 50,
				label: () => tAp("workbench.title")
			}, Workbench));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "agent-pi-codex",
				order: 15,
				label: () => tAp("codex.title")
			}, CodexSettingsSection));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "tender-workbench",
				order: 5,
				label: () => tAp("workbench.title")
			}, WorkbenchOverlay));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "tender-create",
				order: 20,
				label: () => tAp("wb.create")
			}, CreateOverlay));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "tender-files",
				order: 10,
				label: () => tAp("files.title")
			}, FilesRail));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "agent-pi-toast",
				order: 80,
				label: "提示"
			}, ToastHost));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "agent-pi-attach-float",
				order: 75,
				label: "附件条"
			}, AttachmentFloat));
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "agent-pi-attachments",
				order: 5,
				label: "附件"
			}, MainAttachmentDock));
			ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
				name: "conversation.input.left",
				id: "agent-pi-composer-tools",
				order: 20,
				label: "指令润色"
			}, MainComposerTools));
			ctx.inject(["workspaces"], (scope) => {
				runtime.workspaces = scope.workspaces || ctx.workspaces || (typeof scope.get === "function" ? scope.get("workspaces") : null) || runtime.workspaces;
				watchArchivedWorkspaces();
			});
			ctx.inject(["locale"], (scope) => {
				runtime.locale = scope.locale || (typeof scope.get === "function" ? scope.get("locale") : null) || runtime.locale;
				if (runtime.locale && typeof runtime.locale.addLanguage === "function" && typeof runtime.locale.getLocale === "function") {
					const registered = new Set((runtime.locale.getLocale().locales || []).map((language) => String(language.id || "").toLowerCase()));
					for (const language of AP_LANGUAGE_DEFINITIONS) {
						if (registered.has(language.id)) continue;
						try {
							runtime.locale.addLanguage({
								id: language.id,
								label: language.label,
								fallback: language.fallback
							});
							registered.add(language.id);
						} catch {}
					}
				}
				const applyLang = () => {
					const snap = runtime.locale && typeof runtime.locale.getLocale === "function" ? runtime.locale.getLocale() : null;
					setApLang(snap && snap.active ? snap.active : snap && snap.locale);
				};
				applyLang();
				if (typeof scope.on === "function") scope.on("locale/change", applyLang);
			});
			ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register({
				name: "conversation.chat.turnTail",
				id: "agent-pi-harvest",
				order: 80
			}, HarvestOutputs));
			ctx.inject(["inputTriggers", "sessions"], (scope) => {
				runtime.sessions = scope.sessions || (typeof scope.get === "function" ? scope.get("sessions") : null);
				watchWorkbenchTransactionRestore();
				const inputTriggers = scope.inputTriggers || (typeof scope.get === "function" ? scope.get("inputTriggers") : null);
				if (!inputTriggers || typeof inputTriggers.registerSource !== "function") return;
				const source = {
					trigger: "/",
					name: FILE_SOURCE,
					order: 40,
					candidates(_session, req) {
						const query = String(req && req.query || "").toLowerCase();
						return Promise.resolve(runtime.files.filter((file) => !query || file.name.toLowerCase().includes(query) || file.relativePath.toLowerCase().includes(query)).slice(0, 24).map((file) => ({
							name: file.name,
							description: file.relativePath
						})));
					},
					onPick({ candidate }) {
						const ref = candidate.description || candidate.name;
						const file = runtime.files.find((row) => row.relativePath === ref || row.name === candidate.name) || {};
						window.dispatchEvent(new CustomEvent("agent-pi-attach-file", { detail: {
							items: [{
								id: ref + ":" + Date.now(),
								relativePath: ref,
								path: file.path,
								name: candidate.name,
								kind: fileKind(candidate.name)
							}],
							source: "mention"
						} }));
						return {};
					},
					codec: {
						clipboardText: (ref) => ref,
						serialize: (ref) => Promise.resolve("请读取并依据此文件：`" + ref + "`")
					}
				};
				if (typeof scope.effect === "function") scope.effect(() => inputTriggers.registerSource(source), "tender-web: workspace-file source");
				else inputTriggers.registerSource(source);
			});
			ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
				name: "conversation.session.header.utilities",
				id: "agent-pi-task-process",
				order: 10,
				label: "执行详情"
			}, TaskProcessHeader));
			ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "agent-pi-task-guide",
				order: 40,
				label: () => langState.lang === "zh" ? "本次任务" : "Current task"
			}, TaskGuideView));
			ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
				name: "conversation.session.header.utilities",
				id: "agent-pi-files",
				order: 40,
				label: "资源文件"
			}, FilesToggle));
			ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
				name: "conversation.session.header.utilities",
				id: "agent-pi-delete-session",
				order: 80,
				label: "归档对话"
			}, ArchiveSession));
			ctx.slots.inject("sidebar.brand.mark", () => ctx.slots.register({ name: "sidebar.brand.mark" }, SidebarBrandMark));
			ctx.slots.inject("sidebar.brand.name", () => ctx.slots.register({ name: "sidebar.brand.name" }, SidebarBrandName));
			ctx.slots.inject("conversation.hero.brand.mark", () => ctx.slots.register({ name: "conversation.hero.brand.mark" }, HeroBrandMark));
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "agent-pi-studio",
				order: 0,
				label: "Always π AI studio"
			}, placedSidebar(StudioCredit, "ap-mount-studio")));
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "agent-pi-lang",
				order: 1,
				label: "Language"
			}, placedSidebar(LanguageToggle, "ap-mount-lang")));
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "tender-workbench-nav",
				order: 2,
				label: () => tAp("workbench.title")
			}, placedSidebar(WorkbenchNav, "ap-mount-wb")));
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "agent-pi-kb-nav",
				order: 3,
				label: "知识库"
			}, placedSidebar(KnowledgeBaseNav, "ap-mount-kb")));
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "agent-pi-archive-nav",
				order: 4,
				label: "归档"
			}, placedSidebar(ArchiveNav, "ap-mount-archive")));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
