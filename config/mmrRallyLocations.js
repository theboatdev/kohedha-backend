/**
 * Server-side mirror of frontend/lib/mmr-rally/locations.ts.
 * Keep these two in sync when adding or editing locations.
 *
 * Only the properties the server needs for validation are included:
 *   - name: key used in the `answers` map
 *   - required: whether to reject a missing value
 *   - type: used for basic format checks (tel, email, number)
 */

/** @type {Record<number, { id: number; fields: Array<{ name: string; required: boolean; type: string }> }>} */
export const RALLY_LOCATIONS = {
  1: {
    id: 1,
    fields: [
      { name: "driverId", required: true, type: "text" },
      { name: "driverName", required: true, type: "text" },
      { name: "mobile", required: true, type: "tel" },
    ],
  },
  2: {
    id: 2,
    fields: [
      { name: "driverId", required: true, type: "text" },
      { name: "driverName", required: true, type: "text" },
      { name: "vehicleNumber", required: true, type: "text" },
      { name: "mobile", required: true, type: "tel" },
    ],
  },
  3: {
    id: 3,
    fields: [
      { name: "driverId", required: true, type: "text" },
      { name: "teamName", required: true, type: "text" },
      { name: "passengerName", required: false, type: "text" },
      { name: "mobile", required: true, type: "tel" },
    ],
  },
};

export const ACTIVE_LOCATION_IDS = [1, 2, 3];
