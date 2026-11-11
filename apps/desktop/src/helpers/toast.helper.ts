import { toast } from "react-hot-toast";
import { AxiosError } from "axios";

export class ToastHelper {
  static success(message: string) {
    toast.success(message);
  }

  static error(error: Error) {
    if (error instanceof AxiosError && error.response?.data.message) {
      toast.error(error.response.data.message);
    } else {
      toast.error("Something went wrong. Please try again later!");
    }
  }
}
