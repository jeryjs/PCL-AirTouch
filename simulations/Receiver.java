import javax.swing.*;
import java.awt.*;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;

public class Receiver extends JFrame {

    // UI components
    private final DrawingPanel drawingPanel;
    private final JTextArea logArea;

    // WebSocket client instance
    private WebSocket webSocket;

    // Assume incoming coordinates are in a 1920x1080 space
    private static final int TARGET_WIDTH = 1920;
    private static final int TARGET_HEIGHT = 1080;

    public Receiver() {
        super("Ultrasonic Interaction Receiver");
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setSize(800, 600);
        setLayout(new BorderLayout());

        // Drawing panel displays the pointer and click effects
        drawingPanel = new DrawingPanel();
        drawingPanel.setPreferredSize(new Dimension(800, 450));
        add(drawingPanel, BorderLayout.CENTER);

        // Log area for verbose output
        logArea = new JTextArea();
        logArea.setEditable(false);
        JScrollPane scrollPane = new JScrollPane(logArea);
        scrollPane.setPreferredSize(new Dimension(800, 150));
        add(scrollPane, BorderLayout.SOUTH);

        setLocationRelativeTo(null);
        setVisible(true);

        log("Starting WebSocket connection...");
        connectWebSocket();
    }

    // Logs both to the console and the log text area
    private void log(String message) {
        System.out.println(message);
        SwingUtilities.invokeLater(() -> {
            logArea.append(message + "\n");
            logArea.setCaretPosition(logArea.getDocument().getLength());
        });
    }

    // Connect to the WebSocket server using Java 11 HttpClient
    private void connectWebSocket() {
        HttpClient client = HttpClient.newHttpClient();
        // Change the URI to match your server address if needed
        URI uri = URI.create("ws://localhost:8080");
        log("Connecting to " + uri + " ...");

        client.newWebSocketBuilder()
              .buildAsync(uri, new WebSocket.Listener() {
                  StringBuilder partialMessage = new StringBuilder();

                  @Override
                  public void onOpen(WebSocket webSocket) {
                      log("Connected to WebSocket server.");
                      webSocket.request(1);
                  }

                  @Override
                  public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
                      partialMessage.append(data);
                      if (last) {
                          String fullMessage = partialMessage.toString();
                          partialMessage.setLength(0);
                          processMessage(fullMessage);
                      }
                      webSocket.request(1);
                      return CompletableFuture.completedFuture(null);
                  }

                  @Override
                  public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
                      log("WebSocket closed: " + statusCode + " " + reason);
                      return CompletableFuture.completedFuture(null);
                  }

                  @Override
                  public void onError(WebSocket webSocket, Throwable error) {
                      log("WebSocket error: " + error.getMessage());
                  }
              }).thenAccept(ws -> this.webSocket = ws);
    }

    // Process incoming messages (a simple manual JSON parse for known fields)
    private void processMessage(String message) {
        log("Received: " + message);

        if (message.contains("\"type\":\"mouse_move\"")) {
            try {
                int x = extractInt(message, "\"x\":", ",");
                int y = extractInt(message, "\"y\":", ",");
                boolean leftButton = message.contains("\"leftButton\":true");

                // Scale from target dimensions to panel size
                int scaledX = (int) (x * drawingPanel.getWidth() / (double) TARGET_WIDTH);
                int scaledY = (int) (y * drawingPanel.getHeight() / (double) TARGET_HEIGHT);

                SwingUtilities.invokeLater(() -> drawingPanel.updatePointer(scaledX, scaledY, leftButton));
            } catch (Exception e) {
                log("Error parsing message: " + e.getMessage());
            }
        } else if (message.contains("\"type\":\"config\"")) {
            log("Config message received: " + message);
        } else {
            log("Unknown message type received.");
        }
    }

    // A simple method to extract an integer value from the JSON string.
    private int extractInt(String message, String key, String delimiter) throws Exception {
        int index = message.indexOf(key);
        if (index < 0) throw new Exception("Key not found: " + key);
        index += key.length();
        int endIndex = message.indexOf(delimiter, index);
        if (endIndex < 0) {
            endIndex = message.indexOf("}", index);
        }
        String numberStr = message.substring(index, endIndex).trim();
        return Integer.parseInt(numberStr);
    }

    // Panel that draws the mouse pointer and a temporary click effect.
    class DrawingPanel extends JPanel {
        private int pointerX = 0;
        private int pointerY = 0;
        private boolean clickEffect = false;
        private long clickEffectStart = 0;

        public DrawingPanel() {
            setBackground(Color.WHITE);
        }

        // Called when a new pointer position is received.
        public void updatePointer(int x, int y, boolean isClick) {
            pointerX = x;
            pointerY = y;
            if (isClick) {
                clickEffect = true;
                clickEffectStart = System.currentTimeMillis();
                log("Simulating click at: (" + x + ", " + y + ")");
            }
            repaint();
        }

        @Override
        protected void paintComponent(Graphics g) {
            // Draw a gradient background for a modern look.
            Graphics2D g2 = (Graphics2D) g;
            GradientPaint gp = new GradientPaint(0, 0, Color.WHITE, getWidth(), getHeight(), Color.LIGHT_GRAY);
            g2.setPaint(gp);
            g2.fillRect(0, 0, getWidth(), getHeight());

            // Draw the pointer as a red circle.
            g2.setColor(Color.RED);
            int pointerSize = 12;
            g2.fillOval(pointerX - pointerSize / 2, pointerY - pointerSize / 2, pointerSize, pointerSize);

            // If a click was received, draw a blue ring for a brief moment.
            if (clickEffect) {
                long elapsed = System.currentTimeMillis() - clickEffectStart;
                if (elapsed < 500) {
                    g2.setColor(new Color(0, 0, 255, 128));
                    int ringRadius = 20;
                    g2.drawOval(pointerX - ringRadius, pointerY - ringRadius, ringRadius * 2, ringRadius * 2);
                } else {
                    clickEffect = false;
                }
            }
        }
    }

    public static void main(String[] args) {
        SwingUtilities.invokeLater(Receiver::new);
    }
}
