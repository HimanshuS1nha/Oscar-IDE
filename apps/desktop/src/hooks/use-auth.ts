import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import type {
  LoginValidatorType,
  RegisterValidatorType,
} from "@oscar/validators";

import { ToastHelper } from "@/helpers/toast.helper";
import { axios } from "@/lib/axios";

import { API_ROUTES } from "@/constants/api-routes";
import { QUERY_KEYS } from "@/constants/query-keys";

type LoginResponse = { message: string; token: string };

const login = async (credentials: LoginValidatorType) => {
  const { data } = await axios.post<LoginResponse>(
    API_ROUTES.auth.login,
    credentials,
  );
  await window.electron.auth.setToken(data.token);
  return data;
};

/** Refetches the user and goes back to the editor. */
const useOnSignedIn = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return async () => {
    await queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.getUser] });
    await navigate({ to: "/" });
  };
};

export const useLogin = () => {
  const onSignedIn = useOnSignedIn();

  return useMutation({
    mutationFn: login,
    onSuccess: async ({ message }) => {
      ToastHelper.success(message);
      await onSignedIn();
    },
    onError: (error) => ToastHelper.error(error),
  });
};

/** Creates the account, then signs in with it. */
export const useRegister = () => {
  const onSignedIn = useOnSignedIn();

  return useMutation({
    mutationFn: async (data: RegisterValidatorType) => {
      const { data: registered } = await axios.post<{ message: string }>(
        API_ROUTES.auth.register,
        data,
      );
      await login({ email: data.email, password: data.password });
      return registered;
    },
    onSuccess: async ({ message }) => {
      ToastHelper.success(message);
      await onSignedIn();
    },
    onError: (error) => ToastHelper.error(error),
  });
};

export const useSignOut = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => window.electron.auth.clearToken(),
    onSuccess: () => {
      queryClient.setQueryData([QUERY_KEYS.getUser], null);
      ToastHelper.success("Signed out");
    },
    onError: (error) => ToastHelper.error(error),
  });
};
