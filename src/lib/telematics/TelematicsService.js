import { base44 } from "@/api/base44Client";

export const TELEMATICS_COMMANDS = {
  locate: "locate",
  lock: "lock",
  unlock: "unlock",
  horn_lights: "horn_lights",
  alarm_pulse: "alarm_pulse",
  disable_starter: "disable_starter",
  restore_starter: "restore_starter",
  status: "status",
};

export default class TelematicsService {
  static sendCommand(payload) {
    return base44.functions.invoke("sendTelematicsCommand", payload);
  }

  static locate(payload) {
    return this.sendCommand({ ...payload, command_type: TELEMATICS_COMMANDS.locate });
  }

  static getStatus(payload) {
    return this.sendCommand({ ...payload, command_type: TELEMATICS_COMMANDS.status });
  }

  static syncDevice(payload) {
    return this.getStatus(payload);
  }

  static syncTraccarPositions(payload = {}) {
    return base44.functions.invoke("syncTraccarDevicePositions", payload);
  }

  static manageAssignment(payload) {
    return base44.functions.invoke("manageTelematicsDeviceAssignment", payload);
  }

  static startAlarm(payload) {
    return base44.functions.invoke("startTelematicsAlarm", payload);
  }

  static cancelAlarm(payload) {
    return base44.functions.invoke("cancelTelematicsAlarm", payload);
  }

  static disableStarter(payload) {
    return this.sendCommand({ ...payload, command_type: TELEMATICS_COMMANDS.disable_starter });
  }

  static restoreStarter(payload) {
    return this.sendCommand({ ...payload, command_type: TELEMATICS_COMMANDS.restore_starter });
  }

  static lock(payload) {
    return this.sendCommand({ ...payload, command_type: TELEMATICS_COMMANDS.lock });
  }

  static unlock(payload) {
    return this.sendCommand({ ...payload, command_type: TELEMATICS_COMMANDS.unlock });
  }

  static hornLights(payload) {
    return this.sendCommand({ ...payload, command_type: TELEMATICS_COMMANDS.horn_lights });
  }

  static alarmPulse(payload) {
    return this.sendCommand({ ...payload, command_type: TELEMATICS_COMMANDS.alarm_pulse });
  }
}