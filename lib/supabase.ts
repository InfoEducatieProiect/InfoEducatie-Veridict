

export const supabase = {
  auth: {
    signInWithPassword: async ({
      email,
      password,
    }: {
      email: string
      password: string
    }) => {
      console.log('[Veridict] Mock login — email:', email, '| password:', password)
      return {
        data: null,
        error: { message: 'Supabase client not yet configured.' },
      }
    },
  },
}
