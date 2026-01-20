"use client";

import { BsGoogle } from "react-icons/bs";
import { IconType } from "react-icons/lib";
import { ReactNode, useEffect, useRef } from "react";
import { Apple } from "lucide-react";

export default function AuthPage() {
    const loginWithGoogle = function() {
        console.log("log-in with google")
    }

    const logInWithApple = function() {
        console.log("log-in with apple")
    }


    return <>
        <div className="flex items-center justify-center h-dvh">
            <div className="flex flex-col gap-2">
                <BaseButton label="Google" onClick={loginWithGoogle} black={false}>
                    <BsGoogle />
                </BaseButton>
                <BaseButton label="Apple" onClick={logInWithApple} black={true}>
                    <Apple />
                </BaseButton>
            </div>
        </div>
    </>
}

const BaseButton = ({children, label, onClick, black} : {children: ReactNode, label: string, onClick: () => void, black: boolean}) => {
    const buttonRef = useRef<HTMLButtonElement | null>(null);


    useEffect(() => {
        if (!buttonRef.current) return;

        buttonRef.current.addEventListener("click", onClick)

        return () => {
            buttonRef?.current?.removeEventListener("click", onClick)
        }
    }, [buttonRef])

    return (
        <button className={` ${black ? "bg-black text-white" : "bg-white text-black"} px-8 py-2 hover:bg-gray-300 rounded-sm flex items-center w-52 border-2 border-white/10`} aria-label={label} ref={buttonRef}>
            <span className="w-min">
                {children}
            </span>

            <span className="flex gap-5 items-center justify-center w-full">
                {label}
            </span>
        </button>
    )
}