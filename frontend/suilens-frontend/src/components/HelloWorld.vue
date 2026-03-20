<template>
  <v-container class="py-8" max-width="800">
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <span>Live Order Notifications</span>
        <v-spacer></v-spacer>
        <v-chip :color="statusColor" size="small" variant="tonal">
          {{ connectionStatusLabel }}
        </v-chip>
      </v-card-title>
      <v-divider></v-divider>

      <v-card-text class="py-6" style="min-height: 500px">
        <div
          v-if="notifications.length === 0"
          class="text-center text-grey py-8"
        >
          <p class="text-sm mb-1">No notifications yet</p>
          <p class="text-xs text-grey-darken-1">
            Place an order to receive live notifications.
          </p>
        </div>

        <div v-else>
          <div
            v-for="(notification, index) in notifications"
            :key="index"
            class="mb-4 pb-4"
            :style="
              index < notifications.length - 1
                ? 'border-bottom: 1px solid #eee;'
                : ''
            "
          >
            <p class="text-sm ma-0">
              Order placed for {{ notification.data.lensName }} by
              {{ notification.data.customerName }}
            </p>
            <p class="text-xs mt-1">{{ notification.data.message }}</p>
            <p class="text-xs text-grey-darken-1 mt-1">
              {{ formatTime(notification.timestamp) }}
            </p>
          </div>
        </div>
      </v-card-text>

      <v-divider v-if="notifications.length > 0"></v-divider>
      <v-card-actions v-if="notifications.length > 0">
        <v-spacer></v-spacer>
        <v-btn size="small" variant="text" @click="clearNotifications">
          Clear
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";

const WS_URL =
  import.meta.env.VITE_NOTIFICATION_WS_URL ||
  "ws://localhost:3003/ws/notifications";

const MAX_NOTIFICATIONS = 50;

const notifications = ref([]);
const connectionStatus = ref("connecting");

let socket = null;
let reconnectTimer = null;

const connectionStatusLabel = computed(() => {
  if (connectionStatus.value === "connected") return "Connected";
  if (connectionStatus.value === "connecting") return "Connecting";
  return "Disconnected";
});

const statusColor = computed(() => {
  if (connectionStatus.value === "connected") return "success";
  if (connectionStatus.value === "connecting") return "warning";
  return "error";
});

function connectWebSocket() {
  connectionStatus.value = "connecting";
  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    connectionStatus.value = "connected";
  };

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);

      if (payload.event !== "order.placed") {
        return;
      }

      notifications.value.unshift(payload);

      if (notifications.value.length > MAX_NOTIFICATIONS) {
        notifications.value = notifications.value.slice(0, MAX_NOTIFICATIONS);
      }
    } catch (error) {
      console.error("Invalid websocket payload", error);
    }
  };

  socket.onerror = () => {
    connectionStatus.value = "disconnected";
  };

  socket.onclose = () => {
    connectionStatus.value = "disconnected";
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket();
  }, 2000);
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function clearNotifications() {
  notifications.value = [];
}

onMounted(() => {
  connectWebSocket();
});

onUnmounted(() => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (socket) {
    socket.close();
    socket = null;
  }
});
</script>
