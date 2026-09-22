import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.mpxj.ProjectFile;
import org.mpxj.Task;
import org.mpxj.Relation;
import org.mpxj.Duration;
import org.mpxj.reader.UniversalProjectReader;
import org.mpxj.mspdi.MSPDIWriter;
import org.mpxj.primavera.PrimaveraPMFileWriter;
import org.mpxj.primavera.PrimaveraXERFileWriter;
import org.mpxj.primavera.PrimaveraXERFileReader;

import java.nio.charset.StandardCharsets;
import java.nio.charset.CharacterCodingException;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** One bounded local request per JVM. Source files are never modified. */
public final class ProjectPlan {
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final Set<String> EDIT_FIELDS = Set.of("uid", "name", "start", "finish", "percent", "notes");

  public static void main(String[] args) throws Exception {
    var response = System.out;
    // Third-party parsers may print diagnostics. Keep the JSON channel isolated.
    System.setOut(System.err);
    JsonNode request = JSON.readTree(System.in);
    List<ProjectFile> projects = readProjects(Path.of(request.required("source").asText()));
    if (projects == null || projects.isEmpty()) throw new IllegalArgumentException("No project found in file");
    String operation = request.path("operation").asText("read");
    if (operation.equals("export")) {
      int index = request.required("projectIndex").intValue();
      if (index < 0 || index >= projects.size()) throw new IllegalArgumentException("Invalid project index");
      ProjectFile project = projects.get(index);
      Integer editedProjectId = project.getProjectProperties().getUniqueID();
      for (JsonNode change : request.required("changes")) applyChange(project, change);
      String format = request.required("format").asText();
      Path output = Path.of(request.required("output").asText());
      // Node owns path authorization and reserves a new staging file. Never open the source for writing.
      try (var stream = Files.newOutputStream(output)) {
        switch (format) {
          case "mspdi": new MSPDIWriter().write(project, stream); break;
          case "pmxml": new PrimaveraPMFileWriter().write(projects, stream); break;
          case "xer":
            PrimaveraXERFileWriter writer = new PrimaveraXERFileWriter();
            writer.setCharset(StandardCharsets.UTF_8);
            writer.write(projects, stream);
            break;
          default: throw new IllegalArgumentException("Unsupported export format");
        }
      }
      List<ProjectFile> verified = readProjects(output);
      if (verified == null || verified.isEmpty()) throw new IllegalStateException("Export could not be read back");
      int expectedProjects = format.equals("mspdi") ? 1 : projects.size();
      if (verified.size() != expectedProjects) throw new IllegalStateException("Export changed the project count");
      // P6 writers may reorder projects. Match their persistent ID, not the UI index.
      ProjectFile reopened = verified.size() == 1 ? verified.get(0) : verified.stream()
        .filter(item -> java.util.Objects.equals(item.getProjectProperties().getUniqueID(), editedProjectId))
        .findFirst().orElseThrow(() -> new IllegalStateException("Export did not preserve the edited project identity"));
      for (JsonNode change : request.required("changes")) verifyChange(reopened, change);
      JSON.writeValue(response, Map.of("projects", projectList(verified), "format", format));
    } else if (operation.equals("read")) {
      JSON.writeValue(response, Map.of("projects", projectList(projects), "engine", "MPXJ 16.7.0"));
    } else throw new IllegalArgumentException("Unsupported operation");
  }

  private static List<ProjectFile> readProjects(Path path) throws Exception {
    if (path.getFileName().toString().toLowerCase(java.util.Locale.ROOT).endsWith(".xer")) {
      PrimaveraXERFileReader reader = new PrimaveraXERFileReader();
      byte[] bytes = Files.readAllBytes(path);
      try {
        StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes));
        reader.setCharset(StandardCharsets.UTF_8);
      } catch (CharacterCodingException legacyEncoding) {
        // Keep MPXJ's Windows-1252 default for legacy P6 files.
      }
      try (var stream = new java.io.ByteArrayInputStream(bytes)) { return reader.readAll(stream); }
    }
    return new UniversalProjectReader().readAll(path.toFile());
  }

  private static void applyChange(ProjectFile project, JsonNode change) {
    change.fieldNames().forEachRemaining(key -> {
      if (!EDIT_FIELDS.contains(key)) throw new IllegalArgumentException("Unsupported task field: " + key);
    });
    if (!change.path("uid").isIntegralNumber()) throw new IllegalArgumentException("Task UID required");
    Task task = project.getTaskByUniqueID(change.get("uid").intValue());
    if (task == null) throw new IllegalArgumentException("Task UID does not exist");
    if (change.has("name")) task.setName(text(change.get("name"), 4096));
    if (change.has("notes")) task.setNotes(text(change.get("notes"), 100000));
    if (change.has("percent")) {
      double percent = change.get("percent").asDouble(Double.NaN);
      if (!Double.isFinite(percent) || percent < 0 || percent > 100) throw new IllegalArgumentException("Progress must be 0..100");
      task.setPercentageComplete(percent);
      Duration planned = task.getPlannedDuration() == null ? task.getDuration() : task.getPlannedDuration();
      if (planned == null || planned.getDuration() <= 0) {
        throw new IllegalArgumentException("Duration progress requires a positive planned duration");
      }
      // P6 stores duration progress as planned/remaining durations, not as a
      // standalone percentage. Do not invent actual dates or resource usage.
      task.setRemainingDuration(Duration.getInstance(planned.getDuration() * (1 - percent / 100), planned.getUnits()));
    }
    if (change.has("start")) {
      task.setStart(date(change.get("start")));
      task.setPlannedStart(date(change.get("start")));
    }
    if (change.has("finish")) {
      task.setFinish(date(change.get("finish")));
      task.setPlannedFinish(date(change.get("finish")));
    }
    if (task.getStart() != null && task.getFinish() != null && task.getFinish().isBefore(task.getStart())) {
      throw new IllegalArgumentException("Finish must not precede start");
    }
  }

  private static String text(JsonNode node, int max) {
    if (!node.isTextual() || node.textValue().length() > max) throw new IllegalArgumentException("Invalid text value");
    return node.textValue();
  }

  private static void verifyChange(ProjectFile project, JsonNode change) {
    Task task = project.getTaskByUniqueID(change.get("uid").intValue());
    if (task == null) throw new IllegalStateException("Export did not preserve the edited task identity");
    for (String field : EDIT_FIELDS) {
      if (field.equals("uid") || !change.has(field)) continue;
      boolean matches;
      switch (field) {
        case "name": matches = java.util.Objects.equals(task.getName(), change.get(field).asText()); break;
        case "notes":
          String actualNotes = task.getNotes() == null ? "" : task.getNotes();
          String expectedNotes = change.get(field).asText();
          // P6 stores a notebook topic; MPXJ's text projection includes its heading.
          matches = actualNotes.equals(expectedNotes) || actualNotes.equals("Notes\n" + expectedNotes);
          break;
        case "start": matches = java.util.Objects.equals(task.getPlannedStart() == null ? task.getStart() : task.getPlannedStart(), date(change.get(field))); break;
        case "finish": matches = java.util.Objects.equals(task.getPlannedFinish() == null ? task.getFinish() : task.getPlannedFinish(), date(change.get(field))); break;
        case "percent": matches = task.getPercentageComplete() != null && Math.abs(task.getPercentageComplete().doubleValue() - change.get(field).asDouble()) < 0.000001; break;
        default: throw new IllegalArgumentException("Unsupported task field");
      }
      if (!matches) throw new IllegalStateException("Export did not preserve edited field " + field + "; no output was delivered");
    }
  }

  private static LocalDateTime date(JsonNode node) {
    if (node.isNull()) return null;
    return LocalDateTime.parse(text(node, 32));
  }

  private static List<Map<String, Object>> projectList(List<ProjectFile> projects) {
    List<Map<String, Object>> values = new ArrayList<>();
    for (int index = 0; index < projects.size(); index++) {
      ProjectFile file = projects.get(index);
      Map<String, Object> value = new LinkedHashMap<>();
      value.put("index", index);
      value.put("name", file.getProjectProperties().getProjectTitle());
      value.put("calendar", file.getDefaultCalendar() == null ? null : file.getDefaultCalendar().getName());
      value.put("resourceCount", file.getResources().size());
      value.put("calendarCount", file.getCalendars().size());
      List<Map<String, Object>> tasks = new ArrayList<>();
      for (Task task : file.getTasks()) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("uid", task.getUniqueID());
        row.put("id", task.getID());
        row.put("activityId", task.getActivityID());
        row.put("wbs", task.getWBS());
        row.put("level", task.getOutlineLevel());
        row.put("name", task.getName());
        row.put("start", string(task.getPlannedStart() == null ? task.getStart() : task.getPlannedStart()));
        row.put("finish", string(task.getPlannedFinish() == null ? task.getFinish() : task.getPlannedFinish()));
        row.put("duration", string(task.getDuration()));
        row.put("percent", task.getPercentageComplete());
        row.put("summary", task.getSummary());
        row.put("milestone", task.getMilestone());
        row.put("critical", task.getCritical());
        row.put("resources", task.getResourceNames());
        row.put("notes", task.getNotes());
        List<Map<String, Object>> relations = new ArrayList<>();
        for (Relation relation : task.getPredecessors()) {
          if (relation.getPredecessorTask() == null) continue;
          Map<String, Object> link = new LinkedHashMap<>();
          link.put("uid", relation.getPredecessorTask().getUniqueID());
          link.put("type", string(relation.getType()));
          link.put("lag", string(relation.getLag()));
          relations.add(link);
        }
        row.put("predecessors", relations);
        tasks.add(row);
      }
      value.put("tasks", tasks);
      values.add(value);
    }
    return values;
  }

  private static String string(Object value) { return value == null ? null : value.toString(); }
}
